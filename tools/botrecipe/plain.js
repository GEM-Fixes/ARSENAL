// plain-words text for the codes botrecipe prints (BOT_*). of(line) -> sentence or null. Used by botrecipe.js and the GUI ext bots.
// Author: Imperator_Aug (ARSENAL, ia-e36657ef)
const PLAIN = {
  BOT_ANCHOR_MISSING: 'The tool could not find the unit or army list it was told to put the new line next to. Nothing was written. Pick another unit, stage or army.',
  BOT_ARMY_MISMATCH: 'The unit belongs to one army but the place you picked is in another army\'s shopping list, so the bot of the right army would never buy it. Nothing was written. Choose the matching army.',
  BOT_NO_CARD: 'The unit has no buy card (the entry in the multiplayer unit lists that lets a player or bot purchase it). Add the card first, or name a unit that has one.',
  BOT_NO_DATA_LUA: 'No bot shopping list (bot.data.lua) was found in your mod or in the game folder.',
  BOT_NO_MODE_SET: 'The game mode file you named is not in your mod folder.',
  BOT_NO_STAGE: 'The bot list has no purchase stage with that number. Pick a stage that is in the list (the stock list has 8).',
  BOT_NO_ROSTER: 'Gates of Hell keeps each army\'s bot shopping list in its own file per period (units/<army>/<stage>.<army>.lua). Name the army and the period, or a unit already in one of those lists. Nothing was written.',
  BOT_NO_BOT_LUA:'Your mod has no bot script (bot.lua) to patch.',
  BOT_NO_VANILLA: 'The tool needs the stock bot list to compare with. Point it to the game folder.',
  BOT_OUT_IS_SOURCE: 'The output folder lies inside the mod you are reading from. Nothing was written.',
  BOT_ARMY_MISSING: 'An army that exists in the stock bot list is missing from your list, so that army\'s bot will buy nothing in some stage.',
  BOT_UNIT_NO_CARD: 'A unit in the bot list has no buy card, so the bot can never buy it.',
  BOT_STAGE_COUNT: 'Your bot list has a different number of purchase stages than the stock one.',
  BOT_LUA_PARSE: 'The bot list file is not valid Lua data and cannot be read.',
  BOT_LUA_UNSUPPORTED: 'The bot list uses Lua code (functions or variables), not plain data. The tool cannot check it.',
};
// the facts a line carries go into its sentence: BOT_NO_STAGE '(the list has N stages)' -> the real count
const stagesIn = line => { const m = /\(the list has (\d+) stages?\)/.exec(String(line)); return m ? Number(m[1]) : null; };
function stageSentence(n) {
  if (n === 0) return 'No purchase stages could be read in the bot list. Nothing was written. Check the list with "Check my bot list".';
  if (n === 1) return 'The bot list has only 1 purchase stage: pick stage 1, or leave the stage on Automatic. Nothing was written.';
  return 'The bot list has ' + n + ' purchase stages: pick a stage from 1 to ' + n + ', or leave the stage on Automatic. Nothing was written.';
}
const of = line => { const m = /\b(BOT_[A-Z_]+)\b/.exec(String(line)); if (!m) return null; const n = m[1] === 'BOT_NO_STAGE' ? stagesIn(line) : null; return n != null ? stageSentence(n) : (PLAIN[m[1]] || null); };
module.exports = { PLAIN, of, stagesIn };
