# [info: ]file CODE of the seeded mods (mkseed.js), mods sa,sb,sd,sf,sg with --keys; read by seed-test.js (line numbers ignored)
# 1 loose in sa, in a pak in sb
resource/set/s1.def WARN_CONFLICT_MOD_MOD
# 2 one .lng path in both mods; 2b one key in two # files
resource/interface/text/desc.lng CONFLICT_LNG_KEY_LOST
resource/interface/text/desc.lng CONFLICT_LNG_KEY_DIFF
info: resource/interface/text/desc.lng CONFLICT_KEY_OVERRIDDEN
info: resource/interface/text/desc.lng CONFLICT_KEY_OVERRIDDEN
resource/interface/text/#sb.lng CONFLICT_LNG_KEY_CROSS
# 3 a card each in one .set
resource/set/multiplayer/units/units.set CONFLICT_ENTRY_LOST
info: resource/set/multiplayer/units/units.set CONFLICT_KEY_OVERRIDDEN
# 4 shared include (4b: one macro name in two files is quiet)
resource/set/shared.inc CONFLICT_MACRO_LOST
resource/set/shared.inc CONFLICT_MACRO_DIFF
# 5 entity name in two folders
resource/entity/b/foo/foo.def CONFLICT_ENTITY_NAME_DUP
info: resource/entity/y/tank/tank.def CONFLICT_ENTITY_NAME_DUP
# 6 mod.info: missing Require, Delete of another mod's file
mods/sd CONFLICT_MOD_NOT_LOADED
info: mods/sd VFS_MOD_REQUIRE_MISSING
resource/set/gone.def CONFLICT_FILE_DELETED
# 7 picture extension
info: resource/texture/common/t1.dds CONFLICT_TEX_EXT_SHADOW
resource/texture/common/t2.dds CONFLICT_TEX_EXT_SHADOW
# 8 not a text file
resource/script/x.lua WARN_CONFLICT_OPAQUE_MOD_MOD
# 9 .mdl by key
resource/entity/x/tank/tank.mdl WARN_CONFLICT_MOD_MOD
# 10 loose and pak in one mod
info: resource/set/dup.def CONFLICT_PAK_LOOSE_SAME_MOD
# 11 top-level entry dropped
resource/set/c.def CONFLICT_FILE_SHADOW
info: resource/set/c.def CONFLICT_KEY_OVERRIDDEN
# order of the pair
resource/entity/x/tank/tank.mdl MOD_ORDER_UNDECLARED
# 12-15 the joint view and the notes (mods ja jb jc, --joint): not in this list, checked by seed-test.js part 4
