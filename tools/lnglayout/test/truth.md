# lnglayout fixture truth (test/tmp/bad, written by test.js; test/tmp/clean = same layout with 0 findings)
LAY_PARENT_TEXT       localization/desc.lng:15 `{"stray" "Stray"}` text leaf in the parent
LAY_GROUP_TWICE       localization/info.lng:7 second `{"squad"` block
LAY_PART_LNG          localization/desc/mod/extra.lng
LAY_INC_UNUSED        localization/desc/mod/orphan.inc
LAY_DROPPED_INCLUDED  localization/_dropped/desc.inc (included by desc.lng:3)
LAY_INCLUDE_ORDER     localization/desc.lng:18 mod/entity/ger/v2.inc before vanilla/entity.inc
LAY_KEY_BOTH          localization/desc/mod/human/ger.inc:4 "rifle" also in desc/vanilla/human/mp/ger.inc
LAY_KEY_DUP           localization/desc/mod/squad/ger/squad1.inc:4 "Inf_A(ger)" case-only copy
LAY_VANILLA_EDITED    localization/desc/vanilla/entity.inc:2 "tank_a" text "Tank A!" (game: "Tank A")
LAY_MOD_SAME (info)   localization/desc/mod/human/ger.inc:7 "medic" = game text
LAY_KEY_CASE          localization/desc/mod/human/ger.inc:8 "Sniper2"
LAY_FORMAT            localization/desc/mod/human/ger.inc:9 trailing space
LAY_WRONG_PART        desc/human/mp/ger/sniper: injected expectedParts says desc/mod/human/other.inc
LAY_CARD_NO_NAME      card inf_c(ger): no desc/entity or desc/squad key (its {info} redirect has text)
LAY_CARD_NO_INFO (info) card inf_d(ger): no info/squad/inf_d(ger)
LAY_CONTEXT_STALE (info) localization/desc/mod/squad/ger/squad1.inc:5 context names card "gone(ger)"
LAY_INCLUDE_MISSING   localization/desc.lng:20 desc/mod/missing.inc
LAY_WRONG_PART_SKIPPED (info) clean run with expectedParts null
