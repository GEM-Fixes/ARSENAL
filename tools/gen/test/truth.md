# seeded defects / cases (check.js asserts each; fixture built by mkfixture.js)
csv50: 50-row CSV on rifle_a, one file edited once, all rows applied
enc: non-ASCII set value is UTF-8 on AS2 and GoH (D0 91; ENCFIX)
bad entity: nosuch_ent -> GEN_SET_ENTITY_UNKNOWN naming it
bad path: actor/zzz_missing -> GEN_SET_PATH_MISSING naming it, nothing written
ambiguous entity dup_a -> GEN_SET_ENTITY_AMBIGUOUS
binary def bin_a -> GEN_SET_BINARY
bad op frob -> GEN_SET_BAD_OP; missing csv -> GEN_SET_CSV_MISSING; unknown op -> GEN_BAD_SPEC
armor: ("armor_light" args 10 20 30 40) -> 50 20 70 80 (macro arg edited, no override key); wrong count GEN_ARMOR_ARGC; no macro GEN_ARMOR_NO_MACRO
roster AS2 vehicles_rus.set, GoH units/late/units_ger.set; duplicate GEN_ROSTER_EXISTS; unknown like GEN_ROSTER_LIKE_MISSING
squad AS2 (squads.set, other side untouched, CRLF), squad GoH (units_ger.set); unknown breed GEN_SQUAD_BREED_UNKNOWN; undefined macro GEN_SQUAD_MACRO_UNDEFINED; exists GEN_SQUAD_EXISTS
breed AS2 (soldiers.set decl) and GoH (inf_ger.set decl, breed/mp/ger/late/)
text: AS2 #slug.lng UTF-8 never at a vanilla path; GoH .pot UTF-8, no .lng left
--plan writes nothing (no mod dir, no .gen dir) but still names bad rows
out dir inside the game dir -> GEN_OUT_UNSAFE; existing out dir -> GEN_OUT_EXISTS
sample: samples/sample.yaml has all 12 ops, runs clean on the fixture; --sample prints its path; --json parses (ops applied/list, files, skipped, errors); --plan --json writes nothing
map-clone: unknown map MAPCLONE_NO_MAP; missing name GEN_MAPCLONE_ARGS; GoH map (net 05 02) clones; terrain bytes identical; --plan writes nothing
mission-clone: GoH runs mission-clone --exe goh (combat refused there, MC_GOH_NO_MODE via GEN_TOOL_FAILED); missing source mode MC_NO_SOURCE; missing to GEN_MISSION_ARGS; battle_zones combat strips flags; --plan writes nothing
place: unknown def PLACE_ENTITY_UNKNOWN; no pos GEN_PLACE_ARGS; two items get uids 0x3 0x4; GoH works; place on a map cloned earlier in the same spec works; same chain under --plan -> info GEN_PLAN_SKIPPED
GoH unknown field names the T10 glossary (hint text only)
text dup: clone name: + text op same key -> GEN_TEXT_DUP_SKIPPED (one write); differing -> WARN_GEN_TEXT_DUP
gate: refcheck error in a dep file naming nothing made -> WARN_INHERITED (rcInherited)
xx: a "_x" clone op clones the base "_xx" wreck stage too (GEN_XX_AUTOCLONE); a spec that clones _xx itself is not doubled; --plan names it (FIX-PORT, port-donors:17)
