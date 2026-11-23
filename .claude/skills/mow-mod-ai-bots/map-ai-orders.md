# mow-mod-ai-bots: orders for AI units inside a mission

when: "enemy units on my map should attack", "make the AI move to a waypoint", "defenders hold this house", "AI on a skirmish map".
G = AS2 install, `<mod>` = mod folder. This is mission scripting for AI-owned units, not the MP bot.

## Steps
1. read the mission: MCP `mow_mission_info {map:"<map>", mode:"<mode>", mod:"<mod>"}` (triggers, zones, waypoints, placed soldiers)
2. facts and proven forms: MCP `mow_lookup {query:"mission mi-forms", mode:"topic"}` (orders, `actor_fire`, waypoints, empty vehicles) · command fields: guide r11 (`mow_guide {chapter:"r11"}`)
3. GUI: Game Modes & AI tab > `mapai` page (Map scripts for AI: pick a map, see and add AI orders)
4. a single-player mission from a spec writes the common forms for you: `node tools/spmis/spmis.js --list-templates`
5. lint: `node tools/milint/milint.js <mod> [--game G] [--exe as64|mowas_2|goh] [-q]`
6. run it and watch (→ skill `mow-mod-test`); as64 can run a mission by pipe and read marks

## Facts
- orders go to a selector; `actor_to_waypoint` sends units along waypoints defined in `{Helpers}`
- `near` distances are metres (limit = distance x 20 map units, MIS-36)
- the side number of a bot in `{player "n"}` is not fixed per lobby slot (MIS-38): do not hardcode it for MP

## Per game
- as64: mission `switch` runs every case on builds before the fix (MIS-34)
- mowas2: same commands; test by menu
- goh: the host runs triggers, clients none (GHCMD-06); commands gained and lost fields: goh-script-command-fields). The GUI `mapai` page reads GoH maps; writing follows the page's own notice

## Silently fails
- MIS-52 `actor_to_waypoint` on a boarded actor (crew of a gun): refused with a warning, no order runs
- MIS-87 a waypoint not in Helpers: refused, units never move
- MIS-86 a selector `{mids N}` no entity holds gathers nothing, no log
- MIS-49 selector `not inactive` does not drop an inactive entity
- MIS-39 placed vehicles are empty: an AI tank needs a crew boarded by trigger
- MIS-44 an empty placed vehicle draws no fire
- MIS-40 `actor_state` on a selector with only a player: access violation; add `{type human}`
- MIS-45 a mission delete that empties a team ends the match after 30 s

## Verify
- the units move and fight where ordered; put a `mark` or a visible effect behind each trigger so the log shows the order ran
