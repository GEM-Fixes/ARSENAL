# vfs fixture truth (list: modb:1 moda:1 modc modd mode modf modg modh modi:2 nope MODA) -> 10 findings
mods/moda/4.pat: PAT_GAP (no 3.pat; VFS-14)
mods/modc/x.patch: MOD_ROOT_PATCH (no N.pat; VFS-25)
mods/modd: MOD_REQUIRE_MISSING (Require ghost; VFS-17)
mods/mode: MOD_VERSION (3.100..3.200)
mods/modf/1.pat: PATCH_NO_DOC (VFS-24)
mods/modg/1.pat: PATCH_ID ({id 2} in 1.pat; VFS-24)
mods/modh/1.pat: PATCH_REMAP_MISSING (VFS-23)
mods/modi: MOD_VER_GATE (modi:2, one pat; VFS-14)
nope: MOD_UNKNOWN
MODA: MOD_UNKNOWN (VFS-12: list text must be lowercase)
separate list modx,mody,moda:1: DEP_CYCLE, whole list dropped (VFS-16)
info only (not counted): moda/1.patch + moda/readme.md root files, resource/set/ignored.txt (VFS-06), modb/resource/readme.txt
winners asserted in check.js: loose beats earlier pak (set after a.pak), later mod beats earlier, mod.info Delete needs resource/ prefix,
.patch delete removes own + earlier files, prefix delete, remap, case-dup later wins, localization/ replaces base, .svn/.gitignore skipped
