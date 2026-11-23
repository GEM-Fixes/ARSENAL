# doctrine

The Men of War doctrine pack in ARSENAL. It holds rules for how real WW2 small units fought, 9 personas, chat voices, 10 mission kits and 2 mod profiles. It also has a generator that turns a persona into bot settings in **your mod's copy** of `bot.data.lua`.

Nothing here has been played in a match yet. Values the pack marks `design` are starting guesses, and every number the generator writes is [T] (needs an in-game test).

## Commands
```
node tools/doctrine/doctrine.js list rules|personas|missions|voices|profiles [--json]
node tools/doctrine/doctrine.js show <id> [--json]               rule, persona, mission (briefing), voice, profile, modern concept
node tools/doctrine/doctrine.js voice <persona> <event|rule> [seed]   one chat line; same seed gives the same line
node tools/doctrine/doctrine.js profile vanilla|botconfig|conquest [--keys] [--json]
node tools/doctrine/doctrine.js gen --persona P --out <mod> [--profile auto|vanilla|botconfig|conquest] [--base <file|folder>] [--game <dir>] [--exe E] [--scale 0..2] [--plan] [--json]
node tools/doctrine/doctrine.js check <mod|file> [--profile auto|vanilla|botconfig|conquest] [--game <dir>] [--exe E] [--json]
```
- `gen --plan` previews the changes and writes nothing. Without `--plan`, it writes `<mod>/resource/script/multiplayer/bot.data.lua`.
- `--exe as64|mowas_2|mowas2|goh` names the game whose files are read (none: as before, AS64 first on the shared AS2 install). `--exe mowas_2` reads the MoW:AS2 view (no as64/core). `--exe goh` (Gates of Hell, the GoH install when `--game` is not given) uses the **conquest** profile: GoH has no `bot.data.lua` (GHMIS-66); its Conquest bot reads `ConquestConfig` in `script/multiplayer/modes/conquest/runtime_config.lua`, and gen writes your mod's copy of that file. The generator sets 10 wave, counterattack and order settings there [T]. Frontlines, Battle Zones and Last Stand keep their bot settings in code, so a persona does not reach them.
- The base file is chosen in this order:
  1. `--base`, a file or a folder (loose, or inside its `resource/*.pak`);
  2. the mod's own copy;
  3. the game's copy (with `--game`).
- Writes keep the file's bytes, CRLF line ends and cp1251 comments. The tool refuses to write into the game install, except `<game>/mods/<mod>`.
- The first line gets a stamp. Each changed line keeps its old value as `-- [doctrine was K=v]`, so running gen again starts from the original values. The `universal` persona restores the original file byte for byte.
- `check` exits with 1 when it finds an error.
- Errors are written as a plain sentence on stderr, and the tool exits with 2. With `--json`, it also prints `{error, code}`.

## What the game takes
- **Vanilla:** the stock bot reads only `MaxSquadSize`, `OrderRotationPeriod` and `FlagPriority`. The generator sets these from initiative, aggression and caution. Smoke, bounds, reserves, siting and the other rules have no setting in vanilla.
- **BotConfig (a larger replacement bot script with 18 settings the generator can set):** some mods replace the stock bot with a bigger bot script that keeps about 207 settings in a `BotConfig` table (listed with `profile botconfig --keys`). The generator sets 18 of them:
  - DirAttackRatio, AssaultRatio, EarlyAssaultRatio, EarlyPush, WaveTimeout
  - HoldMaxShare, BackShare
  - LaunchShare, EngageDist, BoundStep, DangerDist, SmokeEvery, SmokeAttackEvery, UnderFireMaxMove
  - AttackSpread, GatherMax, SwitchMargin, ReorderPeriod

  These settings work only when that bot script is loaded too. Give the folder of the mod that has it as `--base` if your mod has no bot file yet.- A persona's traits that no setting can express are printed as advice for your missions or your own bot script.
- **How the numbers are worked out:** each temperament value is compared with the `universal` persona. The setting is then multiplied by `1 + direction * strength * difference * scale`, limited to the range 0.4 to 2.5 and to that key's own limits (see `MAP` in lib.js).
- **Not included:** AAR and eval (the game writes no log they could read), and doctrine.lua (JSON only).

## Data and credit
`data/` is a snapshot of the pack (E:/theory/dist/men-of-war-doctrine). It holds:
- `doctrine.json`, schema 1;
- `PACK-README.md`, the pack's own README with its credit and limits;
- `md/`: mission briefings, game notes, profiles, personas and core;
- `text.json`, the same texts as one module so the single exe bundles them;
- `robz-botconfig.json`, the BotConfig key list of that larger bot script, from the pack SDK (file name kept as the pack names it).

All content belongs to the pack's authors. See PACK-README.md.

To refresh the data, run:
```
node tools/doctrine/vendor.js E:/theory/dist/men-of-war-doctrine --robz-yaml E:/theory/3-game/profiles/robz.yaml
```

## GUI
The "Bot doctrine" page (tools/gui/ext/doctrine) has these tabs: Rules, Personas, Missions, Profile, Generate (preview, then write) and Check.

## Test
`sh tools/doctrine/test/run.sh` uses fixtures only, with no game.
