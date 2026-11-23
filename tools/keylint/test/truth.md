# keylint truth: one expected finding per line (file:line: CODE). bad/ must produce exactly these (info lines are not compared).
# a.def:13 GearSwitchDelay 0.0004: no TIMESPAN_TRUNC (engine reads a float, tools/fieldtypes); the 6-value Gears is on its own line 14.
# x.weapon:3,4 projectileDamage/curve beside projectileDamageTable = info only (live for infantry, KEY-25); x.weapon:6 ZeroingAccuracy list and :7 RelaxationTime 0.0001 (float range): no finding.
# ok/: PatherID "airdrop" defined by the mod's set/pather.set, mine extender {Miner}: no finding.
# learned rows need vanilla vocab.json (committed); bad2/ uses test/vocab-mini.json for bool/quant (no vanilla key qualifies).
resource/entity/a.def:2: WARN_UNKNOWN_KEY
resource/entity/a.def:3: WARN_VALUE_SURPLUS
resource/entity/a.def:4: WARN_FLOAT_GOT_NONNUM
resource/entity/a.def:5: WARN_STRING_EXPECTED
resource/entity/a.def:6: WARN_ENUM_UNKNOWN
resource/entity/a.def:7: COLLIDER_UNKNOWN
resource/entity/a.def:8: WARN_PATHER_UNKNOWN
resource/entity/a.def:11: WARN_KEY_REPEAT
resource/entity/a.def:12: WARN_VALUE_MISSING
resource/entity/a.def:13: GEARS_BAD
resource/entity/a.def:14: GEARS_BAD
resource/entity/a.def:15: DEAD_KEY
resource/entity/a.def:16: ACCURACY_BY_MOTION
resource/entity/a.def:17: IK_ZERO_SPEED
resource/set/ability/w.set:3: WARN_DEAD_KEY
resource/set/ballistics.set:2: DEAD_KEY
resource/set/breed/b.set:5: WARN_PERK_LEVEL
resource/set/colliders.set:34: COLLIDER_IDS_MAX
resource/set/material.set:4: WARN_RICOCHET_CLAMP
resource/set/multiplayer/units/t.set:3: KEY_CASE
resource/set/multiplayer/units/t.set:4: INT_FIELD_FLOAT
resource/set/multiplayer/units/t.set:5: INT_FIELD_FLOAT
resource/set/stuff/n.weapon:2: DAMAGE_NUMBER
resource/set/stuff/x.ammo:3: DAMAGE_BLASTWAVE_KEY
resource/set/stuff/x.ammo:4: DAMAGE_UNSUPPORTED
resource/set/stuff/x.ammo:5: DAMAGE_UNKNOWN
resource/set/target/select.set:3: DEAD_KEY
resource/texture/c.mtl:1: WARN_COLOR_HEX_LEN
.patch: LOOSE_PATCH
bad2: resource/entity/b.def:2: WARN_BOOL_NO_IS_TRUE
bad2: resource/entity/b.def:3: WARN_BOOL_BAD_TOKEN
bad2: resource/entity/b.def:5: WARN_QUANT_FLOAT
resource/set/multiplayer/units/vehicles.set:7: WARN_PARAM_PREFIX
resource/entity/ai.def:3: UNKNOWN_KEY
resource/entity/ai.def:5: UNKNOWN_KEY
resource/entity/ai.def:7: UNKNOWN_KEY
resource/entity/ai.def:9: UNKNOWN_KEY
resource/entity/ai.def:11: UNKNOWN_KEY
resource/set/breed/dda.set:3: UNKNOWN_KEY
resource/set/breed/dda.set:5: UNKNOWN_KEY
resource/set/breed/dda.set:7: UNKNOWN_KEY
resource/set/multiplayer/units/dda.set:4: UNKNOWN_KEY
resource/set/multiplayer/units/dda.set:5: UNKNOWN_KEY
resource/set/multiplayer/units/dda.set:8: UNKNOWN_KEY
# ai.def/dda.set: AI-19 / GPL-08 engine key sets (rules.js SCHEMAS); ai.def:12-13 (vehicle brain LookAround, turnoff sensor) and breed 'voice' = engine keys vanilla lacks: no finding.
# CHK-KEY (2h batch): chk.def:2 two quoted tags strings, :4/:5 GoH def keys, :7 armor macro turret(3 values) (:8 is the clean twin); goh.set also hits UNKNOWN_KEY (GPL-08) on the same lines;
# chk_select.inc:1 no catch-all group, no groups (late_all / ranged / ignore-only are clean); ammo.set:8 class with only conditional blocks, class without rules; select.set:2 = the old in_ik_range fixture has select-only groups
# bot.data.lua:2,5 AttackBaseTime/period (the comment on :6 is not code); bot.lua:5,7 non-exported Commands (comment :6 skipped); d.mtl:1 bare diffuse (:2 is quoted).
resource/entity/chk.def:2: TAGS_MULTI_STRING
resource/entity/chk.def:4: GOH_DEF_KEY_IGNORED
resource/entity/chk.def:5: GOH_DEF_KEY_IGNORED
resource/entity/chk.def:7: ARMOR_MACRO_ARGS
resource/set/multiplayer/units/goh.set:2: UNKNOWN_KEY
resource/set/multiplayer/units/goh.set:2: WARN_GOH_MP_KEY_IGNORED
resource/set/multiplayer/units/goh.set:3: UNKNOWN_KEY
resource/set/multiplayer/units/goh.set:3: WARN_GOH_MP_KEY_IGNORED
resource/set/target/chk_select.inc:1: SELECT_NO_CATCHALL
resource/set/target/chk_select.inc:15: SELECT_NO_CATCHALL
resource/set/target/ammo.set:8: AMMO_RULE_GAP
resource/set/target/ammo.set:11: AMMO_RULE_GAP
resource/set/target/select.set:2: SELECT_NO_CATCHALL
resource/script/multiplayer/bot.data.lua:2: BOT_DATA_UNUSED_KEY
resource/script/multiplayer/bot.data.lua:5: BOT_DATA_UNUSED_KEY
resource/script/multiplayer/bot.lua:5: WARN_BOT_API_UNKNOWN
resource/script/multiplayer/bot.lua:7: WARN_BOT_API_UNKNOWN
resource/texture/d.mtl:1: MTL_DIFFUSE_BARE
