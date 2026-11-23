# structure: which RobZ is there and where things sit

First call: `mow_robz_find` (game). It lists every RobZ in G/mods and in the Workshop folder (AS2 app 244450), the version
from mod.info, the layout and the mods that name or require RobZ. The other `mow_robz_*` tools read the newest one unless
`version` or `mod` (full path) says otherwise.

## Two layouts
| layout | seen in | notes |
|---|---|---|
| paks | Workshop item, 1.30.10 and the published 1.31.0 | 7 paks; a path inside a pak starts below `resource/` [V] |
| loose files | 1.31.x trees | `resource/...` and `localization/...` as plain files [V] |
- loose files win over paks of the same mod; the tools read both the same way
- entity.pak and gamelogic.pak can not be used apart: sight and armour defines sit in one, the entities in the other [V] (`mow_robz_issues` RZ-PAKSPLIT)
- the same version as Workshop item and as a folder in G/mods: the game loads the Workshop copy and logs the folder as an old copy [V]

## mod.info
- `MinGameVersion` and `MaxGameVersion` both 3.262: a legacy mod. Native on the 32-bit game; on AS64 Classic mode only (as64.md) [V]
- a sub-mod copies that range and adds `{Require "<RobZ folder name>"}` (submod.md)

## Where the systems sit (paths from the mod root; confirm with `mow_robz_system`)
| what | where | tool |
|---|---|---|
| buy cards, one file set per year range | `resource/set/multiplayer/units/units_*.set` + includes | `mow_robz_unit`, `mow_robz_system kind army` |
| presets: income, CP, unit limits, year | `resource/set/multiplayer/games/{battle_zones,combat,frontline}.set` | `mow_robz_system kind preset` |
| armies added | `resource/set/multiplayer/armies/` | `mow_robz_system kind army` |
| tank damage: shell tiers, points, class scripts | `resource/set/interaction_entity/tank/` | `mow_robz_system kind tier` |
| armour, sight, crew, weapon macros | `resource/properties/*.ext`, `*.inc` | `mow_robz_system kind macro q <word>` |
| soldiers | `resource/set/breed/mp/<side>/` | `mow_unit_find` with the RobZ folder as mod |
| guns, shells, items | `resource/set/stuff/` | `mow_weapon_find` |
| bots | `resource/script/multiplayer/bot*.lua` | skill `mow-mod-ai-bots` |
| texts | `localization/*.lng` (replace the game's files whole) | `mow_text_find` |

## Why the general unit tools show little under RobZ
- RobZ builds its cards with macros (one line per card calls a define); tools that expect plain card blocks see few or none [V]
- `mow_robz_unit` expands the macros first: use it for price, cooldown, CP, rank and what the card brings
- entity side (armour volumes, guns on a tank): `mow_entity_info`, `mow_unit_stats` still work with the RobZ folder as mod

## The 1.31.x tree adds (all [V] read, [T] in game; versions.md)
- one unit set and one preset file per year (41 .. 45), shared macro files under `resource/properties/robz/`,
  card macros in `resource/set/multiplayer/units/_macros.inc`, breed macros in `resource/set/breed/`, per-map bot lua, MACROS.md at the root

## CLI
- `node tools/modinfo/modinfo.js --help` (mod.info read), `node tools/vfs/vfs.js --help` (which file wins)
- long form: refmods/robz/findings.md; pak and mount rules:
