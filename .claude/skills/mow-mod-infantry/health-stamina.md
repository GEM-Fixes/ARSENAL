# mow-mod-infantry: health, stamina, carried weight

when: "more health for soldiers", "soldiers tire too fast", "can not sprint with a machine gun", "stamina regeneration", "unexpected token in vitality".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`.
Health of ONE kind of soldier is a perk level on his breed, not an edit here → `abilities-veterancy.md` in this skill, or skill `mow-mod-units`.

## Steps
1. read the block that wins: MCP `mow_file_which {path:"properties/human.ext", mods:[..]}`, then Read it; includes: `mow_entity_info {names:["<human entity>"], mod:"<mod>"}`
2. change a value: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"set", rows:["<entity>,<key path>,<value>"]}]}` (plan; `write: true` writes)
   CLI `node tools/patch-entity/patch-entity.js <mod> --game G --file <file key> --set p=v [--exe as64|mowas_2|mowas2|goh] --dry-run`
3. lint: `node tools/humlint/humlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]` (HUM_VITALITY_KEY, HUM_STAMINA_ROW)
4. GUI: Mods tab > Check & Fix; the Editor for the file

## Block
```
{extender "vitality"
 {Health {max F}{current F}{inc F}}
 {Stamina {max F}{current F}
   {load a b c d}
   {inc {stay|walk|slow|normal|fast r0 r1 r2 r3}..}
   {movement_limits {Fast lo hi}{Normal lo hi}{Slow lo hi}..}}}
```
- code defaults: health 100 / 100, regeneration 0.5; stamina 100 / 100
- `load` = four carried-mass breakpoints in kg; the band picks which of the four rates `r0..r3` applies: heavier kit = worse rate
- `inc` rows: stamina change per movement mode (negative = drain)
- `movement_limits`: which stamina range still allows fast / normal / slow movement
- carried mass = sum of item mass x count + what fills them (→ `inventory-holders.md` in this skill)
- perks `health`, `stamina`, `health_regeneration`, `stamina_regeneration` scale these per breed by a LEVEL NAME from `set/ability`

## Per game
- as64 / mowas2: as above
- goh: same block inferred ([I]); engineers also carry a `resources` extender for repairs (GHGPL-28).

## Silently fails
- HUM-01 an unknown key inside Health / Stamina: `unexpected token` (load error, visible)
- HUM-03 an `inc` row name other than stay, walk, slow, normal, fast silently writes the FIRST row
- HUM-02 perks only scale regeneration (rates of 0 or more); drain is never reduced
- HUM-04 `movement_limits`: no matching entry = slow, no entries at all = fast; a locked right-hand item forces walking
- GPL-13 an undefined perk level string gives the soldier the top level (a silent buff)
- raising `max` in `human.ext` raises it for every soldier of every army, bots included

## Verify
- humlint clean; in game run one soldier with a light kit and one with a heavy kit over the same distance and compare when each slows; health bar shows the new max; log read (→ skill `mow-mod-test`)
