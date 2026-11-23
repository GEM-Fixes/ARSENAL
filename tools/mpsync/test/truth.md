# name CODE (compare A B; then --mod)
/set/a.set MPSYNC_DETECTED
/entity/x.ply WARN_MPSYNC_SILENT
/entity/y.ply MPSYNC_DETECTED
/entity/l.lua WARN_MPSYNC_SILENT
/entity/t.dds MPSYNC_EXCLUDED_DIFF
/interface/foo.lua MPSYNC_EXCLUDED_DIFF
/script/x.lua MPSYNC_EXCLUDED_DIFF
/map/multi/m1/map MPSYNC_DETECTED
/entity/onlya.mtl MPSYNC_ONLY_IN_A
/entity/onlyb.def MPSYNC_ONLY_IN_B
/sound/s.wav MPSYNC_EXCLUDED_DIFF
