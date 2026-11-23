# soedit check: expected findings on the doctored fixture (test.js step 8), one per line: `- CODE file  why`

- FILE_CHANGED tank1.mdl  comment, {limits}, {resume} and Volume "crew" removed
- FILE_CHANGED start.anm  version 3 -> 5
- FILE_CHANGED body.ply  SUBM parts rewritten as MESH
- MDL_COMMENTS_DROPPED tank1.mdl  2 comment lines -> 1
- MDL_KEYWORD_LOST tank1.mdl  bone "turret": {limits}
- MDL_KEYWORD_LOST tank1.mdl  sequence "open": {resume}
- MDL_BLOCK_LOST tank1.mdl  top-level {Volume "crew"} (no second "volume is gone" line for the same block)
- WARN_ANM_VERSION_CHANGED start.anm  EANM 3 -> 5
- WARN_PLY_SUBM_TO_MESH body.ply  2 SUBM -> 2 MESH
- FILE_MISSING body_lod1.ply  deleted after staging
- FILE_NEW new.anm  written after staging
- PLY_STUB body.ply  stubbed linter finding on a changed file kept (the one on unchanged shot.anm is dropped)
