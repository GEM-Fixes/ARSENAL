# mow-mod-infantry: walking, running, crawling, swimming speeds

when: "soldiers run too fast / slow", "crawl speed", "swim", "sprint", "soldier legs slide", "wounded men are too slow", "Too many strafe motions".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`.
One breed faster than the rest: perk `speed` (a float) on the breed → skill `mow-mod-units` (`abilities-veterancy.md`).

## Steps
1. the table that wins: MCP `mow_file_which {path:"properties/human.ext", mods:[..]}`, Read its `Chassis "foot"` rows
2. change a row: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"set", rows:["<entity>,<key path>,<value>"]}]}` (plan; `write: true` writes)
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --file <file key> --set p=v [--exe as64|mowas_2|mowas2|goh] --dry-run`
3. lint: `node tools/refcheck/refcheck.js <gameDir> --mods <mod> --scope mod [--exe ..]` (FOOT_ROW_MISSING) · `node tools/movlint/movlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]`
4. terrain cost for men: pather profile → MCP `mow_lookup {query:"movement/pather", mode:"topic"}`

## Table
```
{Run {Sneak a b c}{Spot ..}{Walk ..}{Slow ..}{Normal ..}{Fast ..}{Bow ..}}
{Crawl {Slow}{Normal}{Fast}} {Swim {Slow}{Normal}{Fast}}
{Strafe {Forth|Back|Left|Right ..} ..}
{Injured 0.75}
```
- each row: speed km/h, animation period km/h (the speed the animation was authored for), max turn rate deg/s
- animation scale = speed / period: change the speed alone and the legs play faster or slower; keep the ratio near 1 or the feet slide
- vanilla values are in the game file; read them, do not quote them
- `Injured` = factor for wounded men
- the perk `speed` scales the whole table for a breed
- stamina decides which of Slow / Normal / Fast is allowed (→ `health-stamina.md` in this skill)
- humans use this table, not a `Locomotion` block; contacts never push a soldier (`noContactsAtAll`, MOV-27)

## Per game
- as64 / mowas2: as above
- goh: same table form inferred ([I]):

## Silently fails
- HUM-36 a missing row falls back to engine defaults (a slow soldier), no message
- MOV-24 a 7th `Strafe` entry: fatal `Too many strafe motions` at load
- MOV-23 swim is used only on water ground types; a swim request on land is ignored
- HUM-04 no stamina `movement_limits` match = slow whatever the table says
- MOV-09 mud, snow and ice materials do not slow anyone; only ground types in the pather profile do
- MOV-12 a pather profile that leaves a ground type out treats it as free
- a faster Run with the old period: visible sliding, and bots move at the new speed too

## Verify
- in game time a soldier over a measured distance (two map objects a known distance apart) in run, crawl and swim; watch the feet; log read (→ skill `mow-mod-test`)
