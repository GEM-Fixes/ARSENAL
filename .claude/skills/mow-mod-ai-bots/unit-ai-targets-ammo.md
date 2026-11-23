# mow-mod-ai-bots: who a unit shoots at and with which ammo

when: "my tank ignores infantry", "soldiers do not shoot", "MG fires at tanks", "AT gun does not engage", "AI picks HE against armour", "target priority".
G = AS2 install, `<mod>` = mod folder. This is unit AI: it applies to player-owned units too.

## Steps
1. read the rules that win with the mod: MCP `mow_file_which {path:"set/target/ammo.set", mods:["<modname>"]}`; the target groups file `select.set` (find it: `mow_lookup {query:"select.set"}`)
   facts: MCP `mow_lookup {query:"ai target-select", mode:"topic"}` / `{query:"ai ammo-select", mode:"topic"}`
2. the unit's weapons and ammo: MCP `mow_entity_info {names:["<unit>"]}` · `mow_unit_stats {id:"<unit>", show:"equipment"}`
3. change one rule or value in the mod:
   `node tools/patch-entity/patch-entity.js <mod> --game G [--mods d] (--entity n|--file key) --set p=v|--add p=v|--del p [--exe as64|mowas_2|mowas2|goh] [--dry-run]` (`--dry-run` first)
   or MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"set", ...}]}` (fields: tools/gen/README.md)
4. lint: `node tools/keylint/keylint.js <mod> [--game G] [--exe ..] [-q] [--summary]` (SELECT_NO_CATCHALL, AMMO_RULE_GAP, brain/sensor key sets with did-you-mean)
5. can the gun hurt the target at all: MCP `mow_matchup {attacker:"<unit>", target:"<enemy>", range:300}` (numbers → skill `mow-mod-weapons-damage`)
- GUI: Game Modes & AI tab > `unitai` page (target and ammo rules, brain and sensor values)

## Facts
- the unit takes the FIRST fitting target selector and the FIRST matching ammo rule in file order (AI-02, AI-05): order is the priority
- firing also needs range, line of sight and a weapon place that works: wrong `fire "weapon"` place names never fire (INT-21)

## Per game
- as64 / mowas2: same files and rules
- goh: target and ammo rules have GoH-only terms and a changed infantry tactic (GHAI rows):; keylint knows the GoH key sets, findings are [I]

## Silently fails
- AI-01 a contact matched by no `select.set` group is never attacked: keep a late catch-all group
- AI-05 no matching ammo rule = no fire at all (an MG against a tank)
- KEY-20 target term `in_ik_range` is always false: a rule built on it never selects
- AI-19 a typo in a brain/sensor key logs "unexpected token" and the key has no effect
- MIS-44 an empty placed vehicle is not shot at: test against a bought, crewed enemy
- NET-03 weapon state is not hashed at sync level 1: a rule that differs between players shows late, as a desync

## Verify
- a match or the editor: put the unit against the target class, watch it open fire with the ammo expected; as64 scripted pairs: `node tools/edrun/edrun.js --game G --root <dir> --exe as64_ed.exe --pairs pairs.json --dry` first
