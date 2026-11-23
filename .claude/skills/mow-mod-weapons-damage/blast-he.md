# mow-mod-weapons-damage: HE blast (layers, radius, the frag layer, what blast breaks)

when: "bigger explosion", "HE does nothing to infantry", "HE kills tanks too easily", "frag radius", "artillery too strong", "my new blast layer removed the old one".
game word: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh` · CLI `--exe as64|mowas_2|goh`. `<mod>` = the user's mod folder.

## Steps
1. read the layers of a shell: MCP `mow_weapon_find` (`q` = shell name, `mod`) · CLI `node tools/statsheet/statsheet.js [gameDir] [--exe as64|mowas_2|goh] [--folder <mod>] --sheet ammo --fmt md --filter <name>`
2. a new HE shell with its own layers: MCP `mow_mod_gen` (`mod`, `ops`, `write`) with a `shell` op: `id`, `like`, `blast` (list of layers), `preset` + `args` (a `fg*` macro and its filler value), `mass`, `damage_edit`; sample `node tools/gen/gen.js --sample shell`
   CLI `node tools/gen/gen.js spec.yaml|json --target as64|mowas2|goh [--plan] [--out dir] [--game G]`
3. change a layer of an existing shell or of a `fg*` macro in `set/stuff/shell/.presets`: gen op `set` or `macro` (same MCP call), or `node tools/patch-entity/patch-entity.js <mod> --game G --file <key> --set p=v [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
4. lint: `node tools/keylint/keylint.js <mod> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (DAMAGE_BLASTWAVE_KEY, DAMAGE_REPLACES, VOLUME_NO_BLAST) and `node tools/check/check.js <mod>`
5. GUI: no blast page; Editor tab on the shell file, Mods tab > Check & Fix for the lint; pages via `gui_pages`

## The model (shared engine) [V]
- a blastwave is the only explosion primitive: `{damage blastwave {energy E} {area r0 r1}}` (metres). "frag" is just a second, wider, weaker layer; fragments are not simulated
- `damage blastwave` WITHOUT `add` replaces the first existing layer; `damage add blastwave` appends (DMG-13, KEY-17)
- falloff: full E inside r0, linear to 0 at r1, nothing beyond; distance is to the entry point of the target volume. not affected by how far the shell flew (GPL-01)
- the wave travels at 15 m/s; a target is judged when the wave arrives (DMG-21, GPL-02)
- only volumes with `able blast` are hit; an unbroken volume shields everything behind it on that ray (DMG-15, KEY-03)
- armour sees 5 x E: nothing under the area's blast threshold; damage adds up per layer until the area breaks (`break_armor`, sender "blast"). repeated HE wears armour down
- soldiers: AI-controlled take about 200 x E health; player-controlled far less (DMG-22). prone / in cover the distance is scaled up, so the lethal radius shrinks (factors in `set/difficulty/difficulty_generic.inc`)
- scripts run once PER LAYER: a 3-layer shell fires `blast_hit` three times (DMG-14)
- detonation: `detonationThickness N` = detonates once it has gone through N mm; vanilla HE uses a small N so any real plate or wall sets it off; `applyProjectile` adds an AP wound

## Tuning hints [V data / derived]
- vanilla shell macros: `fg`, `fg_medium`, `fg_heavy` (first layer = small anti-armour core, last layer = infantry reach). other `fg_*` names are mod data: read the mod's `.presets`
- pick the filler value first, then the macro by class
- to weaken HE against light vehicles lower the first layer's energy; infantry kills start around E 0.59 in a layer [soft data], so raising a wide very weak layer kills nobody
- +1 m on the outer radius of the middle layer is about +1 m of lethal reach
- every layer counts in `explosive_amount`: adding one shifts cook-off odds of all carriers (DMG-18); keep the total when you only reshape

## Per game
| game | note |
|---|---|
| as64 | as above |
| mowas2 | same model; `--exe mowas_2` |
| goh | same blastwave form; vehicle parts lose health by `(5E - threshold) x blastwave_modifier` (GHDMG-49); per-layer script rule differs (GHDMG-43); player blast factor differs (GHDMG-33). Not yet tried in game [I] |

## Silent fails
- DMG-13 two plain `damage blastwave` lines: only the last survives (statsheet BLASTWAVE_REPLACED)
- KEY-02 a key other than `energy`, `area` inside the block: "unexpected token" error, block lost
- KEY-03 a volume cleared with `{able clear ..}` takes no blast at all
- DMG-16 a script block written `{##on blast` is skipped whole
- a missing terrain effect only logs `Unknown props` and shows no crater

## Verify
- statsheet `--sheet ammo --scope mod`: the layers as meant
- in game: console `dbg_blast 1` prints energy, radii and what each volume took [V]; fire at soldiers at set distances and at a light vehicle; read the log (→ skill `mow-mod-test`)
