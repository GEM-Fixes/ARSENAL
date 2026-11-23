# seeded defects, one per line: <mod>: <file>[:line]: CODE   (static, diffed by check.js; run `static <mod> --from goh --to mowas2` unless noted)
seed: mod.info:3: MOVE_VERSION_RANGE_MOWAS2
seed: mod.info:5: MOVE_REQUIRE_AS64PLUS
seed: as64/core/resource/shader/x.hlsl: MOVE_AS64_CORE_ONLY
seed: localization/as64/english.lng: MOVE_AS64_LNG
seed: resource/set/as64/squad_size.set: MOVE_AS64_PLUS_SET
seed: 1.pat: MOVE_PATCH_LAYOUT
seed: resource/set/cp.set:2: MOVE_ENC_CP1251
seed: resource/map/a.materials: MOVE_EXT_GOH_ONLY
seed: resource/entity/vehicle/tank.def:2: WARN_MOVE_PORT_ARMOR_HEALTH_CUSTOM
seed: resource/entity/vehicle/tank.def:2: WARN_MOVE_PARSE_FAIL
# ENG-24: --from as64 --to mowas2
badinfo: mod.info:1: MOVE_MODINFO_FATAL
# AS2 assets: --from as64 --to goh
togoh: resource/entity/inventory/weapon/smg1/smg1.def:2: WARN_MOVE_GOH_WEAPON_INCLUDE
togoh: resource/entity/inventory/weapon/smg1/smg1.mdl:2: WARN_MOVE_GOH_FORESIGHT
togoh: resource/set/stuff/head/h1:1: WARN_MOVE_GOH_HEAD_PATTERN
togoh: resource/entity/vehicle/usa/truck1/truck1.def: WARN_MOVE_GOH_VEHICLE_DEF
# clean legacy mod as64 -> mowas2: no findings at all
# live (stub exe), see check.js: MOVE_LIVE_MODE_MISMATCH MOVE_LIVE_STAGE_REFUSED MOVE_LIVE_STAGE_EXISTS MOVE_LIVE_SKIPPED MOVE_LIVE_RUNNING MOVE_LIVE_CRASH MOVE_LIVE_REPEAT_EXCEPTION
