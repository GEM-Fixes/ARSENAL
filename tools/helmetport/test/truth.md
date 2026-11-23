# run 1 (--item x10 --game): one seeded defect each
1 resource/set/stuff/head/hv/helm_a: WARN_HP_KEY_DROP
1 resource/set/stuff/head/lt/cap_a: WARN_HP_LIGHT_ARMOR
1 resource/set/stuff/head/lt/cap_a: WARN_HP_NO_ENTITY
1 resource/set/stuff/head/mask_x: WARN_HP_NO_HEAD_TAG
1 resource/set/stuff/head/mask_x: WARN_HP_DUP_NAME
1 resource/set/stuff/head/mask_x: WARN_HP_NO_ENTITY
1 resource/set/stuff/head/bad_from: WARN_HP_FROM_UNKNOWN
1 resource/set/stuff/body/armor_v: WARN_HP_NO_ENTITY
1 resource/set/stuff/body/radio_p: WARN_HP_BODY_NOT_WORN
1 resource/set/stuff/head/clash1: WARN_HP_NAME_CLASH
1 resource/set/stuff/head/macro_m: WARN_HP_MACRO
1 resource/entity/inv/head/src/helmb.ply: WARN_HP_MTL_MISSING
# run 2 (--breed sold --as same folder)
2 resource/set/stuff/head/mask_x: WARN_HP_NO_HEAD_TAG
2 resource/set/stuff/head/mask_x: WARN_HP_DUP_NAME
2 resource/set/stuff/head/mask_x: WARN_HP_NO_ENTITY
2 resource/set/stuff/body/armor_v: WARN_HP_NO_ENTITY
2 resource/set/stuff/head/mask_x: WARN_HP_SLOT_MASK
# run 3 (--as other folder): relative include
3 resource/set/breed/x/hp2.set: WARN_HP_REL_INCLUDE
# run 4 (--item ghost): not found, exit 1
4 ghost: HP_ERR_NOT_FOUND
# run 7: --fit auto --tone auto (refs: AS2 = GoH + 0.5 0 0.3, grey 100 vs 50); helm_a diffuse is a fake dds
7 resource/set/stuff/head/hv/helm_a: WARN_HP_KEY_DROP
7 resource/texture/common/_hum/helm.dds: WARN_HP_TONE_DECODE
# run 8: --fit auto without --game: default offset
8 fit: WARN_HP_FIT_REF
# run 9: --cap-tone 2 --cap-spec ref (vanilla base.mtl spec + power 76): no findings
# run 10: --cap-spec ref without --game: default ref
10 cap-spec: WARN_HP_SPEC_REF
