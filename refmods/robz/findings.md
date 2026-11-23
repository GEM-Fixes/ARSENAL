# robz realism mod 1.30.10: what the tools found (2026-11-03)

The modding tools were run on the robz realism mod, and every kind of finding was checked against the game.
Each finding was sorted into one of three groups:

## Tool mistakes that were fixed

**keylint (key checker), 479 findings down to 65.**
- The largest group was 215 `Miner` keys reported as unknown. The engine does read this key for mines.
- Another 153 findings said `projectiledamage` and `curve` were dead because a damage table sits next to them. The
  engine still uses those keys for infantry, so these are now information only.
- Smaller groups:
  - weapon_work repeats that are allowed (10)
  - `RelaxationTime` values, which are a valid number range (15)
  - the words `attach` and `normal`, which are valid settings (14)
  - `ZeroingAccuracy` written as a list (3)
  - the `airdrop` pather name, which the mod itself defines (4)

**milint (mission checker), 413 findings down to 364.**
- 34 warnings compared the number of spawn points with the player count. The engine never checks this, so these are
  now information only.
- 14 warnings were about extra mission files sitting next to a valid mode file. These are now information only.
- One command, `event_on_cancel`, was missing from the tool's list of known commands.

**lnglint (text file checker), 331 findings down to 181.**
- 150 duplicate text keys had exactly the same text both times, so they do no harm and are now information only.
- `(include)` and `(define)` lines were wrongly flagged.

**ialint (interaction checker), 16 findings down to 2.** 14 findings were things the vanilla game does as well, so
they are now information only.

**refcheck (missing file checker).** It made no mistakes: all 96 findings are real. Its sound check was tightened to
look for `.wav` files only, because the engine never loads `.ogg`. It also now knows the built-in ground types
`deep_water` and `no_pass_human`.

## Real problems in the mod

These are worth passing on to the mod author.

- **The AI never buys many units.** 283 unit names in `bot.data.lua` do not match any unit card in the mod. They look
  like older names with era suffixes, such as `smgs_40(eng)`. The engine skips any name it cannot find, so AI players
  never buy those units.
- **31 sounds are silent.** The sounds are listed in the data but have no `.wav` file, for example `breda30_reload`,
  `dp27_reload` and `mgun/mg13_burst`.
- **30 item, weapon and ammo names are wrong.** They point to things that do not exist, for example `mg34_2`,
  `panzershreck6` and `bullet88_ger ap`. One example is `ammo 7x54`, while the ammo file is actually tagged `7,5x54`.
- **The "snow" ground type is unknown.** `pather.set` uses a ground type called "snow" 13 times, but the engine does
  not define it. Movement costs for it are therefore undefined.
- **13 equipment entries point to missing definitions.**
  - 10 Japanese hachimaki helmets (`jap_army_helmet*_hatimaki`)
  - bandoliers
  - the 7,5x54 ammo
  - `mortar81.d832.ammo`
- **Old collision settings.** The mod's copy of `colliders.set` is out of date. 15 references point to collision
  profiles that no longer exist, so those objects fall back to the default profile. The missing profiles include
  torpedo, canister, airhelp, awzone and tow_gun_signal.
- **Ricochets that can never happen.** 16 rows in `material.set` set the outgoing value above the incoming value. With
  those values the engine never lets the shot deflect.
- **The horse movement type is missing.** `horse.inc` asks for a movement type called "horse", which is not defined in
  `pather.set`. This causes an error when it is used.
- **Text and interface problems.**
  - 327 duplicate text keys, where the later one wins
  - 4 typos that mix Latin and Cyrillic letters in one word
  - 7 interface pictures that are missing
  - a `trench_deep` panel button that has no action behind it
- **A call that does nothing.** `human.inc` line 1439 calls `hand_right`, but nothing handles that call.
- **Blast damage is turned off.** In `tank_armoredcar.inc` line 1447 the blast section is commented out with `{##on
  blast`. Its blast damage table is therefore ignored.
- **Smaller issues.**
  - 3 animation name typos, such as `seat_sd222_gunner2`
  - 2 missing meshes
  - 2 models referenced from the wrong folder
  - 1 missing texture, `$/flora/cotton`
  - 4 mission unit limits written as `only-one=1,super_persh=1`, where the second entry is lost
  - 2 duplicate object IDs in one mission
  - 2 script calls missing an argument
  - 23 repeated particle settings, which are harmless
- **An unlisted multiplayer map.** The `multi/test` map is not listed under any game mode, so it cannot be picked.

## Confirmed in game since

The AI unit purchase problem is now confirmed on as64: an engine check found the same 283 dead names, and a fix showed no
gain in play. See potential.md, "Live results".

## Three mods, and how RobZ does damage (user, 2026-11-06)

**Three different mods:** RobZ (`robz realism mod 1.30.10`, copy `robz130_as64`), godny (`godnymod`), and a third whose name combines both, which layers godny models into RobZ (`robz realism mod 1.30.10 godny implementation`, copy `godny_as64`; that it is this folder is read from the folder list [I]). Name the exact one in every report. RZ-1 ran `robz130_as64` only.

**RobZ damage is interaction-script based; vanilla's is more hard-coded (user).** Sizes from the paks [V], RobZ against vanilla, `set/interaction_entity`:
- `tank.inc` 143 KB against 64 KB, `tank/tank_medium.inc` 52 KB against 20 KB, `car.inc` 29 KB against 16 KB, `cannon.inc` 25 KB against 12 KB, `human.inc` 65 KB against 18 KB, `vehicle.inc` 39 KB against 16 KB.
- New in RobZ: `tank/safeties/` (`damage_counter`, `combat_capable_check`, `penetration_safety`, `blast_safety`, ten `damage_counter_blast_add` steps) and `fortify/`.
- `muzzle.inc` 15.9 KB against 1.9 KB. Firing itself runs more script here, and RZ-1 didn't read it, so it is the first place to look for why some tanks don't kill [I].

So on RobZ a kill test measures these scripts, not vanilla damage. Read them before calling a NOKILL an engine or spawn fault.

## is2, su76, m4a3_105 deal no damage under the stack (RZ-4, 2 valid games)
NOKILL on gaz67b and pz4h, under destroyed body, broken body and not moveable, with default and fg-only boxes, while kv85 kills pz4h and fury kills gaz67b [V]. Not the mark, not the ammo box, not the test [I]. The same three kill on as64+ alone (rz3). Whether a shell leaves the gun is unseen [T].
Separate point: kv85 on gaz67b passes on broken body but not destroyed body, so destroyed body can be too strict for a soft car here [V]. `car.inc` sets no body-destroyed state, it rests on engine hit points [I].
Next: `entity.pak` alone, then `gamelogic.pak` alone.

## The two main paks can't be split (RZ-5)
`entity.pak` alone crashes on the first tank def: sight and armour defines (`rus_2-5x_sight`, `rus_4x_sight`, `armor_heavy_advanced`) live in `gamelogic.pak` [V for the first, I for the others]. `gamelogic.pak` alone crashes before the mission: `set/fxmanager.set` wants fx entities such as `ground_blood_big` [V crash]. No pair ran. A split needs one pak plus a chosen part of the other.

## is2, su76 no shell at all; m4a3_105 does damage (RZ-6, 3 games, all void)
The fury control missed in all 3 games, and kv85 also flips, so this is evidence, not counted results. m4a3_105: 9 hits, own wave lines on pz4h, PASS 190 s; RZ-4's NOKILL was too few shots [I]. is2, su76: `shots 0 hits 0` in every game and no wave of their own, so the shell never detonates: gun never fires or shell lost at the muzzle, not the damage script [I]. Shell lines and entities read normal [V]. is2 alone has `muzzle_maximum_sides`; su76 shares its muzzle with the fury, so the muzzle doesn't explain su76 [V]. Which of the two is [T].

## M2 reading, RobZ and the combination, tested apart (RC-R, 4 games)
RobZ `robz130_as64`: spawn 100%, kills kv1_40 and kv85 only, 5 kills not met. is1, kv1s, is122 show no muzzle blast in 2 games, same family as is2, su76 in RZ-6 [I]. No RobZ foe died, so its script damage path is not shown on a RobZ unit [V]. `godny_as64` is the combination (godny models in RobZ), not plain godny: spawn 100%, 6 kills, each unit flipped between runs except kv85 on jagdpanther [V]. Single fury controls often miss; no game had both miss [V].

## M2 reading, plain godny (RG-1, 2 games)
`godnymod_as64` alone on as64: boots, 8 of 8 spawn in both games, kills by is2, jagdpanther, t34_3, kv2, pz6bh, then hetzer, su100, m4a3e8 [V]. pz6bh killed changed units jagdpanzer_iv, t34_0 and kv85 [V]. It shadows 1853 base files, 1078 of them entity [V]. hetzer on gaz67b 0 hits in 200 shots while hetzer on pz4h kills: that pair, not the unit [I]. isu152 0 shots, one run [T]. No error names the mod, but no `Mod: activate mod` line appears either, so its hitboxes being in use is [T].

## RobZ heavies with no effect (RZ-7, 2 valid games + 1 void)
is1, is2, is122, kv1s, su76 do no damage on hard or soft foes, while kv85, kv1_40, fury do. is1 and kv85 share gun stuff and `muzzle_large`, kv1_40 fires with the same pattern `aphebc`: gun and pattern are not the split [V]. The one data split left: every silent shooter's round uses a plain `shell_ap_*` entity, the firing ones `shell_apc_*` or `shell_us_apc_*`, yet their collider and extender match [V, I cause]. `shots 0` proves nothing on these shooters, kv85 damages its foe with no muzzle line [V]. These fire on 32-bit, per the user. Never fires vs shell lost still open.

## is1 with kv85's round (RZ-8, 1 valid game + 1 void)
is1 keeping its gun but holding kv85's round did no damage to pz4h or a soft gaz67b, while kv85 hit pz4h 5 times and killed it in the same game [V]. The plain `shell_ap_*` round is ruled out as the only fault, on one valid game [V]. Coax roles and main visor taken from kv85 also did 0 hits, in the void game only [I]. is1 has damaged nothing in 5 games, kv85 did in 4 [V]. Left: damage volumes, armour include, the mdl.

## is1 model, not its volumes (RZ-9, 2 valid games, 1 crash)
Vanilla is1 and su76 damage foes on as64 [V, one run each], so the fault sits in RobZ's versions. kv85's def on is1.mdl goes silent while kv85 on its own model hits 6 times in the same game; is1 with kv85's volumes stays silent [I, N=1 each]. kv85 runs on the vanilla kv-85.mdl, since RobZ's pak has none; RobZ's is1.mdl is a 2014 re-export (`is85.max`) [V]. Against vanilla is1.mdl it drops the `socket` coax and hull MG bones and adds `{speed 0.0035}` on the turret; whether either causes the silence is [T]. RZ-10 tests it.

## is1, corrected (RZ-10, one game)
The silence did not reproduce at dist 600: stock is1 landed 3 hits, kv85 on is1's model 4, where RZ-9 had 0 at the default dist. So part of the silence was range or aim [I], and the section above overstates it. Removing the turret speed line and using socket MG bones each stay NOKILL with 2-3 hits. Only is1's def on the vanilla model killed (6.8 s, 5 hits), and only the RobZ-model units end with `aimer chain ... still locked` [V log, N=1]; which line causes it is [T]. RobZ stays 2 of 5. This line of sessions is closed; RobZ's damage is interaction script based, so a kill there also depends on what its scripts read.
