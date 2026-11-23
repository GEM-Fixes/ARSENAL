# Work with Claude: skills and MCP servers

ARSENAL comes with a set of skills and two MCP servers for Claude. With them Claude can look up how the game behaves, check and change a mod, tell you whether a gun beats a tank, read the game log, and work the ARSENAL window for you. They cover Men of War: Assault Squad 2, its 64-bit build AS64 and Gates of Hell, for modding and for playing.

Two terms first. A **skill** is a short guide Claude loads when your question matches it: it tells Claude which tool to use and which rule of the game applies. An **MCP server** is a small program that gives Claude tools it can call, such as "check this mod". The skills name the server tools first and the plain command second, so they work with or without the servers.

## You need

- Claude Code or Claude Desktop.
- Node.js, and the ARSENAL folder with its `tools` folder and `.claude/skills` folder.
- For the window tools: the ARSENAL window running (`node tools/gui/gui.js`).

## The quick way

In the ARSENAL window open Help & Docs > Claude. The page lists every skill and every group of tools as its own piece, the pack groups (Modding, Playing, The three games and lookups, ARSENAL window, RobZ Realism) and the full pack. Each has "Download" (a zip) and "Install into Claude". Pick where to install (Claude Code for you, one project folder, or Claude Desktop), press Preview to see the exact files and entries, then Install. It makes a backup of a settings file before it changes it, leaves other entries alone, and "Uninstall" takes out only what it put in. For Claude Desktop the skills are saved as zips for you to upload there.

The same from the command line:

```
node tools/mcp/pack/pack.js list
node tools/mcp/pack/pack.js zip --group playing --out playing.zip
node tools/mcp/pack/pack.js install --all --target claude-code-user --write
```

## Steps

1. **Switch the servers on.**
   In Claude Code, started in the ARSENAL folder: nothing to set up. The file `.mcp.json` registers both servers; approve them when Claude Code asks and check with `/mcp`.
   From another folder, or in Claude Desktop: follow `tools/mcp/install.md`. It gives the two `claude mcp add` lines and the block for `claude_desktop_config.json`.

2. **Say which game you mean.**
   Every tool takes the game: `as64`, `mowas2` or `goh`. Tell Claude the game once ("this is for Gates of Hell") or set `ARSENAL_GAME`. Without either, AS64 is used. One tool serves all three games and names the differences in its answer; where a game can not be served, the answer says why.

3. **Ask in plain words.**
   Claude picks the skill by what you ask. Examples:
   - "Check my mod in `D:\my-mods\frontline` and tell me what is wrong."
   - "Can a Panther's gun go through a T-34-85 at 500 m from the front?"
   - "Why did the game crash on loading the map?"
   - "My friend and I get out of sync with this mod. Which files differ?"
   - "Raise the price of the Tiger in my mod by 10 percent."
   - "Open the Units page on the Tiger in the ARSENAL window."

4. **Allow writing, if you want Claude to change files.**
   Out of the box every tool only reads. A tool that changes files answers a preview: what it would change. To allow changes, set `ARSENAL_WRITE_ROOTS` to the folder that holds your own mods (more than one with `;` between them) and restart the server. Claude must still ask for the change with `write: true`; the preview comes first.

5. **Allow starting the game, if you want test runs.**
   Set `ARSENAL_ALLOW_LAUNCH=1` and restart the server. Then Claude can switch the enabled mods, start a test match, drive the menus and take a screenshot. Without it Claude can still ask for a dry run, which says what would be started and starts nothing.

## The two servers

**`arsenal`** (`tools/mcp/server.js`) works on its own, without the window. Its tools, by group:

| Group | What the tools do | Examples |
|---|---|---|
| Knowledge | How the game behaves, known limits, what differs between the games, which tool does a job, the pages of this guide. | `mow_lookup`, `mow_limit`, `mow_game_diff`, `mow_tools`, `mow_guide` |
| Mods | Read, check and fix a mod; what a mod changes; clashes between mods and a patch mod that keeps both sides; upgrade or move a mod to another game; pack it. | `mow_mod_info`, `mow_mod_check`, `mow_mod_fix`, `mow_mod_diff`, `mow_mods_clash`, `mow_mods_patch`, `mow_mod_upgrade`, `mow_port_plan`, `mow_mod_pack` |
| Units and weapons | Find a unit or a weapon, read its numbers, change price, armour, name, squad, equipment, weapon slots, skin and texture variant. | `mow_unit_find`, `mow_unit_stats`, `mow_unit_change`, `mow_kit_slot`, `mow_look_set`, `mow_weapon_find`, `mow_weapon_change` |
| Text, maps, modes, bots | Find and set a text; read maps and missions; copy a map, add a game mode, place an object; allow and check bots. | `mow_text_find`, `mow_text_set`, `mow_map_info`, `mow_map_clone`, `mow_mode_add`, `mow_map_place`, `mow_mode_bots`, `mow_bots_recipe` |
| Balance and multiplayer | Units whose price does not fit, the price calculator, which files the lobby compares between players. | `mow_balance_check`, `mow_price`, `mow_mp_sync` |
| Playing | The install and its enabled mods, the last game log, a crash explained, gun against armour, the armour of a unit, what an army can buy, what beats a unit, game modes, bots, options and key bindings. | `mow_game_status`, `mow_game_log`, `mow_game_crash`, `mow_matchup`, `mow_unit_armor`, `mow_army`, `mow_unit_counter`, `mow_mode_info`, `mow_bots_info`, `mow_settings_info` |
| Running the game | Switch the enabled mods, start a match, drive the menus, take a screenshot. Off until you allow it. | `mow_mods_enable`, `mow_game_start`, `mow_game_drive`, `mow_game_shot` |
| Models, textures, effects, sound | Find and read a model, check it, copy it into a mod, missing textures, animations, sounds, effects, icons. | `mow_model_find`, `mow_model_info`, `mow_model_check`, `mow_asset_missing`, `mow_texture_info`, `mow_anim_list`, `mow_sound_find`, `mow_fx_find`, `mow_icon_check` |
| Scripts | Check interaction scripts, mission triggers and bot Lua; list the events and commands the game knows; find where one is used. | `mow_script_lint`, `mow_script_words`, `mow_script_find`, `mow_mission_lint`, `mow_mission_triggers`, `mow_lua_check`, `mow_console_find` |
| RobZ Realism | Find the installed RobZ, what it changes, its own systems, its unit cards, check a sub-mod against it, known issues. | `mow_robz_find`, `mow_robz_changes`, `mow_robz_system`, `mow_robz_unit`, `mow_robz_submod`, `mow_robz_issues` |

**Load only what you need.** The tools sit in small groups (`knowledge`, `mod`, `together`, `units`, `weapons`, `text`, `maps`, `bots`, `play`, `coach`, `run`, `assets`, `scripts`, `robz`). Started plain, the server offers all of them. Started with `--groups units,weapons` it offers only those, so Claude reads a short tool list. The Claude page and `tools/mcp/install.md` give the ready lines per group.

**`arsenal-gui`** (`tools/mcp/gui.js`) talks to the running ARSENAL window. It finds the window by itself. Its tool list is made from the window's own pages and routes, so it follows the window as the window changes.

| Tool | What it does |
|---|---|
| `gui_status` | Whether the window runs, which game tab is open, which mod is chosen. |
| `gui_pages` | The tabs and pages, and what each is for. |
| `gui_routes` | What the window can be asked, with the fields of each request. |
| `gui_call` | One request to the window: the same answer the page shows. A request that changes files answers a preview first; the change itself needs a folder you allowed and a clear yes in the call (`write: true` in the request, or `confirm_write: true` where the window has no preview of its own). Requests that open the window to other devices are never sent. |
| `gui_jobs` | Long jobs that are running or done. |
| `gui_open` | A link that opens a page of the window for you, on the right game, unit or file. |
| `gui_lang` | The words on a page, in the language of the window. |
| `gui_start` | Starts the window when it is not running. Off until you allow starting (`ARSENAL_ALLOW_LAUNCH=1`). |

The full list, one line per tool and skill, is in `tools/mcp/CATALOG.md`. It is written by a command, so it is always the list of what is really there.

## The skills

Each skill is a short index of under 60 lines that names its sub-tasks; the detail of one sub-task is in its own small file, which Claude reads only when that sub-task comes up.

| When you ask about | Skill |
|---|---|
| A new mod, `mod.info`, load order, a mod that does not show | `mow-mod-start` |
| Units: find, numbers, price, squad, equipment, skin | `mow-mod-units` |
| Guns, ammunition, penetration, armour, balance, prices | `mow-mod-weapons-damage` |
| Maps, missions and game modes | `mow-mod-maps-missions` |
| Text, translation, buy panel, icons | `mow-mod-text-ui` |
| Bots and unit AI | `mow-mod-ai-bots` |
| Checking a mod and fixing what the check finds; an old mod on the 64-bit build | `mow-mod-check-fix` |
| Two or more mods at the same time | `mow-mod-together` |
| Moving units, maps or mods between Gates of Hell and Assault Squad 2 | `mow-mod-port` |
| Running a mod in the game and reading the log | `mow-mod-test` |
| Models, textures, animations, effects, sound | `mow-mod-models-effects` |
| Interaction scripts, mission triggers, console, bot Lua | `mow-mod-scripts` |
| How soldiers behave: health, stamina, morale, inventory | `mow-mod-infantry` |
| How vehicles behave: chassis, speed, crew places, turret, fuel | `mow-mod-vehicles` |
| Multiplayer rules of a mod: modes, budgets, doctrines, what desyncs | `mow-mod-multiplayer` |
| RobZ Realism: playing it, sub-mods on top of it, RobZ on AS64 | `mow-robz` |
| Packing, the Workshop, multiplayer with friends | `mow-mod-share` |
| Playing: can X kill Y, what to buy, how armour and ammunition work | `mow-play-coach` |
| Playing: installing mods, starting a match, bots, settings | `mow-play-setup` |
| Playing: the game does not start, crashes, out of sync | `mow-play-trouble` |
| Playing: lobby, hosting, game modes, team play | `mow-play-multiplayer` |
| Playing: campaign, saves, direct control, replays | `mow-play-singleplayer` |
| Playing: what each army has and what to buy | `mow-play-armies` |
| What is the same and what differs between the three games | `mow-games` |
| Doing a job through the ARSENAL window | `arsenal-gui-use` |
| Changing the ARSENAL window itself | `arsenal-gui-dev` |

To use the skills in another project, copy the folders from `.claude/skills` into that project's `.claude/skills`, or into `~/.claude/skills` to have them everywhere, and register the `arsenal` server there too.

## What it writes and where

- Nothing, until you set `ARSENAL_WRITE_ROOTS`. Then only inside the folders you listed.
- Never the game's own `resource` and `packages` folders, never the rest of the game install outside `mods`, and no tool deletes files.
- A mod inside `<game>\mods` is written only when you list that mod folder, or `mods`, yourself.
- Fixes go into a patch mod beside your mod, the same as on the Check & Fix page; your mod's own files stay as they are.
- The servers make no network calls.

## What can go wrong

- **A tool is missing.** Ask Claude to call `mow_tools`. A part that failed to load is named there with the reason; the other tools keep working.
- **"writing is off"** or **"outside the folders that may be written".** Set `ARSENAL_WRITE_ROOTS` and restart the server.
- **"starting or driving the game is off".** Set `ARSENAL_ALLOW_LAUNCH=1` and restart the server.
- **The game folder is not found.** Set `ARSENAL_AS2_DIR` or `ARSENAL_GOH_DIR`, or choose the folder once in the ARSENAL window.
- **`arsenal-gui` says the window is not running.** Start it with `node tools/gui/gui.js`.
- **An answer from the numbers is not a test.** A check that passes, a match-up from the armour simulator and a dry run say what the files say. Run the mod in the game and read the log before you call a change done ([p14](p14-check-fix-read-log.md), [chapter 18](18-testing-and-logs.md)).

## In Gates of Hell

None of this has been tested in a running Gates of Hell game. Every tool takes `goh`, and the answer says where Gates of Hell differs. Some jobs are not served there and the tool says so: the price calculator, and starting a match with a chosen map and mode (Gates of Hell and the original Assault Squad 2 are started and steered through recorded menu steps instead). What is known about Gates of Hell comes from reading its data and program, so a rule the answer marks as not confirmed should be checked in your own game. The skill `mow-games` holds the differences by area.

## More

- `tools/mcp/install.md`: every way to install, every setting.
- `tools/mcp/CATALOG.md`: every tool and skill.
- [Chapter 19, The toolchain](19-toolchain.md): the window and the commands the tools run.
- [Use the Quick Guided Task](p17-quick-guided-task.md): the same jobs by hand in the window.
