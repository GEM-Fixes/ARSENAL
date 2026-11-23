# mow-mod-ai-bots: brain and sensor values of a unit

when: "units react too late", "soldiers do not see the enemy", "make infantry hold instead of charging", "change how far a unit spots", "brain", "sensor", "visor".
G = AS2 install, `<mod>` = mod folder.

## Steps
1. where the unit gets them: MCP `mow_entity_info {names:["<unit>"], mod:"<mod>"}` (inherits, extenders); most come from `properties/*.ext` templates (`human.ext`, `tank.ext` ...)
   facts: MCP `mow_lookup {query:"ai vision", mode:"topic"}` · sight itself: `{query:"vision-fx vision-def", mode:"topic"}`
2. read values side by side: GUI Game Modes & AI tab > `unitai` page (brain and sensor values, per gun: `bots/brain/values`, `bots/brain/guns`)
3. change one value in the mod:
   `node tools/patch-entity/patch-entity.js <mod> --game G [--mods d] (--entity n|--file key) --set p=v|--add p=v|--del p [--exe as64|mowas_2|mowas2|goh] [--dry-run]`
   a value in a shared `.ext` changes every unit that includes it: say so, or patch the one entity
4. lint: `node tools/keylint/keylint.js <mod> [--game G] [--exe ..] [-q] [--summary]` (brain / sensor / visor key sets, did-you-mean) · `node tools/refcheck/refcheck.js G --folder <mod> --scope mod [-q]` (REF_VISION*, VISION_RULE_SHADOWED)
5. full check: MCP `mow_mod_check {mod:"<mod>"}`

## Facts (as64), vision-fx/vision-def, vision-rules
- sensor `{vision "name"}` names a vision of the winning `set/vision`; the rules tree is first-match-wins among siblings (VIS-02)
- infantry tactic by morale and threat: advance above morale 70, retreat below 50 / 30 (thresholds in code; quotes the AS2 side)
- there is no suppression state: `IsPinned` means a selected user-mode unit; fear comes only through morale (HUM-09)

## Per game
- as64 / mowas2: same keys
- goh: more human sensor and brain keys, a changed retreat/advance loop (GHAI-01), outlines through walls. GoH keys in an AS2 mod are fatal "unexpected token" (PORT-53)

## Silently fails
- AI-19 a typo in a brain/sensor key: "unexpected token" in the log, the key has no effect
- VIS-25 a sensor `{vision "x"}` that does not exist: fatal at def read
- VIS-04 hearing: a unit whose `HearingBias` is above the signal radius ignores the sound; there is no per-event loudness
- VIS-05 `set/detect.set` values are reveal seconds and act only with fog of war on
- VIS-07 the night sight factor is skipped when the target is lit; 105 stock presets set `night_vision 1`
- MIS-68 bot tuning keys `retreat_ratio`, `advance_ratio` are seen once only [V once]

## Verify
- the editor or a match: same scene before and after, measure the spotting distance or the reaction by eye; tag the result [T] until two runs agree
