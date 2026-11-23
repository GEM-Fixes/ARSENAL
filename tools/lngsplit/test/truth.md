desc.lng:11 relative include parts/extra.inc, nested include parts/nested.inc -> desc/squad/x(ger)
desc.lng:12 rooted include /interface/text/parts/rooted.inc -> desc/weapon/w1 (multi-string value)
desc.lng:13 INCLUDE_MISSING parts/missing.inc
parts/cyc.inc:1 INCLUDE_CYCLE
desc.lng:5 changed key desc/human/mp/ger/mg: mod part only, not in the vanilla part
desc.lng:9 duplicate Tank_A: later copy wins, written once
desc.lng:4 dead desc/human/mp/ger/Ghost (no breed): parked in _dropped/desc.inc
#dlg.lng:2 '#' file: keys mp/title, mp/newui without title prefix
out2 desc/vanilla/human/mp/ger.inc seeded text change -> JOIN_TEXT_DIFF
out2 desc/mod/weapon.inc seeded lost key -> JOIN_ONLY_A
info.lng:3 inf_a(ger) on infantry card, button squad1 -> info/mod/squad/ger/squad1.inc under "; -- group squad_1 --", header label from mp/scene/hint_squad1
info.lng:4 hero1(ger) card under the hero button -> info/mod/hero/ger.inc
info.lng:5 hero2(ger) card commented out (b(hero)) -> hero/ger.inc, context line "card commented out"; dead verdict (parked) without --no-park
info.lng:6 moto_grp(ger) card of two bikes + soldiers -> info/mod/vehicle_group/ger.inc, not under squad
info.lng:10 tank_a on ger/v2 card and eng/v3 card {info tank_a} -> entity/ger/v2.inc (first appearance), note "also under eng/v3"
info.lng:7 nobody(ger) no card -> info/mod/squad/unlisted.inc; info.lng:11 ghost_tank -> info/mod/entity/unlisted.inc
desc.lng squad inf_a(ger) / hero1(ger) / moto_grp(ger) -> desc/mod/squad/ger/squad1.inc, desc/mod/hero/ger.inc, desc/mod/vehicle_group/ger.inc
desc.lng entity Tank_A -> desc/mod/entity/ger/v2.inc; bike (only in {content} of moto_grp) -> entity/ger/squad1.inc; ghost2 no card -> entity/unlisted/misc.inc (parked when dead)
desc.lng human mg (changed) -> context "first in card inf_a(ger) ger/squad1"
info.lng bare_gun(ger), card "Bare_Gun" -> renamed to info/squad/Bare_Gun (card spelling)
desc.lng bare_two(ger) next to bare_two with same text -> dropped_identical
info.lng bare_three(ger) next to bare_three with other text -> not_renamed_other_text, context MISKEYED, not renamed
info.lng van_card(ger), bare van_card holds the vanilla text -> renamed_changes_vanilla, [changed] in the mod part
desc.lng bare_four(ger) + bare_four(eng), card side ger -> ger renamed, eng not_renamed_side
join --compare with --renames: 0 differences; without: differences (rc 1)
mod2 desc.lng ammo 9x19 ger -> desc/mod/ammo/ger/ammo.inc, context "stuff ammo/9x19.ger.ammo | cal 9x19 | used by mp40"
mod2 desc.lng weapon kar98 ger -> desc/mod/weapon/ger/rifle.inc, context "takes 7_92x57"; helmet ger -> desc/mod/stuff/head.inc "weight 1.2"; zz ghost -> desc/mod/ammo/unlisted.inc
mod2 vanilla 7_92x57 ger + human rifle -> vanilla parts with "[vanilla]" context lines (stuff / first in card)
mod2 desc.lng "; ToE: checked" above inf_a(ger) -> kept directly above the key, under the regenerated context line
mod3 (= split of mod2): _dropped/desc.inc + dead-keys.tsv carried, newly dead zz ghost appended to both; README.md copied; ToE line added in a part survives; no desc_parts folder
expectedParts(mod2) part == file each key sits in after split
