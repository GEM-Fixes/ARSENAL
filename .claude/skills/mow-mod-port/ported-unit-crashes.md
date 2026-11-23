# mow-mod-port: a ported unit crashes, does not move or does not fire

when: "the game crashes when I buy the ported tank", "it spawns but cannot be driven", "the gun never shoots", "it cannot be killed", "checker textures".
G = AS2 install, `<mod>` = the ported mod folder. The fix loop: log → the family named → portfix → run again.

## Steps
1. read the run: MCP `mow_game_log {}` (cause + limits row per finding) · crash: `mow_game_crash {}`
   CLI `node tools/logtriage/logtriage.js [<logDir|game.log>] --mod <mod> [--exe as64|mowas_2]`
2. match the symptom below, apply the one repair, rerun the static gate: `node tools/portverdict/portverdict.js <mod> --game G`
3. bisect when the log names nothing: buy units one by one; swap the gun for vanilla `mg34 filled` on the same place: MG kills and cannon does not = weapon or ammo; MG fails too = aim, rig or crew (TST-64)
4. prove a fix (as64): `node tools/prove/prove.js --game G --army a --unit <card> [--kind vehicle] [--tiny] [--mods a,b] --plan` first

## Symptom → cause → repair
- crash at load, "unexpected token", log names a macro: PORT-53 GoH key with no AS2 reader → `portfix keys`
- crash at load after removing a perk block: PORT-18 leftover `perks{component{..}}` shell → remove the whole block
- crash at load, light: PORT-171 GoH light extender form → `portfix extenders`
- crash at mission load, `{?limits`: PORT-127 `{limits}`/`{speed}` on a plain mdl bone → defcheck, then fix the bone type or drop the block
- fatal `Different grid cell sizes!`: PORT-70 a GoH map (cell 5) → `goh-map-to-as64.md`
- loads, no log line, nobody can board or drive: PORT-122 donor def parts differ from the mdl → `node tools/donorfit/donorfit.js <def> --game G --fit`
- drives, gun silent: PORT-133 towed gun `basis` plain; PORT-37 (AS2 → GoH) wrong include / foresight bone; FC_AIMBONE codes of `node tools/firecheck/firecheck.js <def>`
- fires, never hurts: PORT-132 GoH car mdl under a vanilla car def; ammo rule gap AI-05
- crash when the item is used, not at load: LOG-07 `No Stuff found` → `dummy_checker` → `portfix carrystuff`
- no wheel traces / fx missing: VIS-28 tracer not in `fxmanager.set`; VIS-19
- checker textures: VIS-29 / VIS-30, PORT-160, FMT-02 (BC5) → `node tools/goh2as2/texcheck.js <mod> --game G --goh H`
- hull armour far off: PORT-179 → armorsim (skill `mow-mod-vehicles`, `armour-layout.md`)
- cannot be scored as killed in a test: MIS-42, MIS-54, MIS-59 (kill marks on vehicles) → use `destroyed_components` with mask `body`, or crew state

## Per game
- as64: the control pipe, prove and edrun make the loop scriptable
- mowas2 [I]: no pipe, boot + log only; no ported unit has run there yet
- goh (AS2 unit in GoH): PORT-37 loads but will not fire until the include and foresight bone are the GoH ones; PORT-46 the mod is refused unless its range holds the exe version

## Verify
- one run with: spawn line in the log, the unit drove, the turret turned, the gun fired and damaged, the unit was destroyed. Log kept. Anything not seen stays [T]
