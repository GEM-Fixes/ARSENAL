release fixture rel/m (one defect per line)
.git/ → REL_STRAY_FILE (dev folder)
Thumbs.db → REL_STRAY_FILE
resource/entity/a.bak → REL_STRAY_FILE
resource/entity/b.orig → REL_STRAY_FILE
art/hero.psd → WARN_REL_STRAY_FILE (source)
notes.txt → WARN_REL_STRAY_FILE (root note)
resource/entity/dup.def → WARN_REL_PAK_LOOSE_DUP (also in resource.pak)
info REL_NET_SIZE_ONLY: .mtl×1 .ply×1 .anm×1 .vol×1 (script .lua and texture excluded)
info REL_EMPTY_DIR resource/empty/
clean: mod.info, 1.pat, ok.def, script, texture → no findings
