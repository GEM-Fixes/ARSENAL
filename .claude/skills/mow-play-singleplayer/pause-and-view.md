# mow-play-singleplayer: pause, slow time, camera, screenshots
When: "how do I pause", "slow motion", "take a screenshot", "show the score".

## Steps
1. Read the keys of this profile: `mow_settings_info {game: "as64", what: "keys", filter: "pause"}`; all: leave `filter` out.
2. Camera and video options: `mow_settings_info {game: "as64", what: "options", filter: "camera"}`.
CLI: `node tools/keyprof/keyprof.js --file <keys.set> --list`. GUI: Tools & Settings > Settings.

## Manual defaults; a profile may differ)
| action | key |
|---|---|
| pause (single player) | `Pause` |
| slow time | `Backspace` |
| statistics | `F1` |
| screenshot | `F12` |
| direct control | `E` |
| team chat / all chat | `I` / `O` |

## Rules
- pause is single player on AS2; in multiplayer the game speed follows the slowest PC (NET-12 [V]).
- your own profile's keys win over a mod's default keys. UI-13 [V file]
- a misspelt key name in `keys.set` is ignored with no message. UI-11 [V]
- screenshots and the profile sit under the My Games folder (`mow_game_status` names it).

## Per game
- MoW:AS2 and AS64: one shared `keys.set`.
- GoH: other key names (GHUI-36); only the host pauses in multiplayer (GHNET-05).

## What goes wrong
- "pause does not work": a multiplayer match, or the key is rebound.
- slow time left on: the whole mission crawls; press the key again.
- screenshot key captured by another program (Steam overlay uses `F12` too).

## Check
The key the tool names does the action in a single-player mission.
