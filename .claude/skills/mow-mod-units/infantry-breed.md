# mow-mod-units: soldier type (breed file)

when: "new soldier type", "change the rifleman", "portrait", "voice", "helmet / vest of a soldier", "soldier shows as a skeleton".
game: MCP `game` = `as64|mowas2|goh` · gen `--target as64|mowas2|goh`. `<mod>` = the user's mod folder (full path), G = game install.
Perks and ranks → abilities-veterancy.md · items carried → inventory-kit.md · uniform → skins-textures.md (each stands alone).

## Steps
1. read a breed: MCP `mow_unit_stats` (`id` of its card or squad, `breed: "army/name"`, `show: ["equipment","look"]`, `mod`)
2. new breed from an old one: MCP `mow_mod_gen` (`mod`, `ops: [{op:"breed", name:"<new>", army:"<tag>", like:"<base>", set:{"<key>#1":"<value>"}, display:"Shown name"}]`, `write`). also `veterancy`, `decl`, `del`, `period` (GoH)
   then put it in a squad or on a card: op `squad` (`members: ["<new>:N"]`) or `card`
   CLI `node tools/gen/gen.js --sample all` shows a `breed` op; `node tools/gen/gen.js --schema` lists its fields
   one key of an existing breed: `node tools/patch-entity/patch-entity.js <mod> --game G --file <breed file key> --set p=v --dry-run`
   GUI: Units tab, the soldier's cards (Equipment, Look)
3. lint: `node tools/humlint/humlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]`

## Breed keys (shared), guide 08, r05-humans
- file `set/breed/**/<name>`, root `{breed ...}`; breed name = file title, subfolders ok
- `behaviour` brain state (soldier, civilian ..) · `hero` (no `desc/human/` text in the unit bar)
- `skin` = `/entity/humanskin/<name>.def`, default `skeleton` · `portrait` = `/interface/scene/portrait/` · `icon` = `/interface/scene/squad/`, `icon_priority` picks who stands for the squad
- `nationality` = name generator group + default voice; `voice` overrides
- `armors {body "<tags>"}{head "<tags>"}` = stuff put into the soldier's armour holders
- `perks`, `veterancy`, `inventory {..}` blocks
- a card's `content "breed:n"` and script `spawn_human "breed"` look the breed up by name
- soldier body values (health, stamina, speed rows) sit in the human entity and its `.ext`, not in the breed

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| breed path | `set/breed/..`, named `army/name` | same | named `army/period/name` |
| inventory box | 6 x 10 | 6 x 10 | 8 x 12 [V data] |
| veterancy clamp | 0..5 | 0..5 | 0..8 (GHHUM-07) |
| humlint | [V] rules | same | rules are [I] |
- GoH adds ability kinds that AS2 has as ids only (GHHUM-26)

## Silent fails
- HUM-18 unknown breed name: warning `Unknown breed "x"` only, soldier wears skin `skeleton`
- HUM-19 breed `tags`: the engine reads only `kamikaze`; other tags do something only if a script or selector reads them
- HUM-22 an armour item the holder rejects: `Can't put armor %s to %s`, soldier spawns without it
- HUM-24 `pierceAbsorb` belongs to the holder in the entity def, not to the item: a new vest item can not carry its own protection value
- HUM-36 a human missing foot speed rows falls back to engine defaults (slow soldier) (refcheck FOOT_ROW_MISSING)
- HUM-04 `movement_limits`: no matching entry = SLOW; a heavy item locked in the right hand forces WALK
- unknown key in a breed file = `unexpected token` at load (loud, in game.log) [V humans/breeds]
- UI-03 a missing portrait or icon picture is silent: stub or nothing

## Verify
- `mow_unit_stats` (`id`, `breed`, `show`, `mod`) reads the new breed back
- in game: spawn or buy the squad, look at portrait, uniform, hands, name under the unit bar; game.log has no `Unknown breed` (→ skill `mow-mod-test`)
