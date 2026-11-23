# fix fixture truth (fx/game with mods m1 loose, m2 packed, m3 clean)
m1 localization/desc.lng: replaces vanilla desc.lng, lacks entity/two + weapon/rifle1 -> merged (BOM, CRLF, Cyrillic kept)
m1 localization/#extra.lng: not in vanilla -> untouched
m1 m1a.mtl line 2: texture "tex_unique", 1 candidate -> repointed to /entity/other/tex_unique
m1 m1a.mtl line 3: texture "tex_dup", 2 candidates -> FIX_REPOINT_AMBIGUOUS, not edited
m2 resource.pak m2a.mtl: texture "tex1", 1 candidate -> repointed (packed mod read)
m2 resource.pak set/stuff/rifle2: fireSound "shot_unique", 1 candidate -> repointed to weapon/shot/snd/shot_unique
m2 localization.pak desc.lng: replaces vanilla -> merged
m3: lng already covers every vanilla key -> CHANGED 0, no folder created
--set Extension="gone.mdl" -> adds REF_MODEL_MISSING -> FIX_GATE_REVERTED, no folder
--set TurnTime#1=6 -> passes the gate, byte-exact one-token edit
--set on vanilla ok.def -> whole file copied from its vfs layer into the patch mod
--out inside/equal to the mod, inside the game resource/, game dir, ancestor of the game, non-empty foreign folder -> FIX_OUT_REFUSED
source mods byte-identical after every run
m4 inc_ok.def: include "lost/helper.inc", 1 same-name file in vfs -> repointed to "/set/lib/helper.inc"
m4 inc_amb.def: include "lost/dup.inc", 2 candidates -> FIX_INCLUDE_AMBIGUOUS, not edited
m4 inc_none.def: include "nowhere.inc", 0 candidates -> FIX_INCLUDE_NO_CANDIDATE
m4 mac_ok.def: ("mymac") defined in exactly 1 .inc -> (include "/set/lib/mac.inc") added at the top
m4 mac_amb.def: ("dupmac") defined in 2 files -> FIX_MACRO_AMBIGUOUS
m4 mac_none.def: ("nomac") defined nowhere -> FIX_MACRO_NO_DEFINITION
m4 gap.ply: material gap.mtl missing, sibling mesh_ok.mtl exists -> copy at entity/m4/gap.mtl, flagged VISUAL RISK
m4 m4b/lonely.ply: material missing, no sibling .mtl -> FIX_STUBMTL_NO_SOURCE
m4 default run: no quarantine, no Delete in mod.info
m4 --only include,macro,quarantine: mac_none, mac_amb, inc_amb, inc_none .def get mod.info Delete; mac_none listed with referrer set/stuff/qref; fixed entities kept
external copy of m4 under FX/ext (outside game/mods): fixed through a staged game dir (junctions), no FIX_NOT_MOUNTED, staged dir removed
m5 (text fixers, lib/textfix.js): 9 files changed, none reverted. enc: txt.def 2 cp1251 strings -> UTF-8, comment bytes kept; amb.def (cp1252) FIX_ENC_AMBIGUOUS. spell: case.def ("Armor") -> ("armor") and no FIX_MACRO_NO_DEFINITION row; m5game.set maxTeamPlayers -> maxTeamSlots; combat.set line equal to vanilla FIX_SPELL_INHERITED
syntax: bare.mtl {diffuse "tex1"}; tags.def {tags "a b c"}. asread: m5.pattern threshold 0.5 -> 1; map.info maxPlayers 3 -> 4 (MI_MAP_POINT_MISSING text with the new count is not a new finding)
env preset: m.mi "old/clear" -> "day/clear" (1 candidate); "old/fog" 2 candidates = one FIX_REPOINT_AMBIGUOUS row for 2 lines; "gone/none" FIX_REPOINT_NO_CANDIDATE. set/stuff/m5two: repoint + asread merged into one edit
--target classic: enc skipped, 8 files. --only asread: 3 files
