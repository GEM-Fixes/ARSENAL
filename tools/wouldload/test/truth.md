# wouldload fixture truth: mod -> seeded defect -> verdict. fx is built by mkfixture.js
game/mods/clean: none -> LOADS_STATIC on as64, mowas2
game/mods/nomax: legacy Min without Max -> REFUSED on as64, mowas2
game/mods/nomin: legacy Max without Min -> REFUSED on as64, mowas2
game/mods/range_low: range 3.100..3.200 misses data version -> REFUSED on as64, mowas2
game/mods/modern_ok: Min 3.301 no Max -> LOADS_STATIC on as64, REFUSED on mowas2
game/mods/modern_high: Min 3.999 above plain 3.301 -> REFUSED on as64, mowas2
game/mods/crash_macro: undefined macro in entity def -> LIKELY_CRASH tank_m
game/mods/crash_inc: missing include in entity def -> LIKELY_CRASH tank_i
game/mods/crash_via: undefined macro in an include of an entity def -> LIKELY_CRASH tank_v
game/mods/crash_weapon: weapon with no stuff -> LIKELY_CRASH tank_w
game/mods/silent_only: undefined macro in a def outside resource/entity -> LOADS_STATIC, finding counted silent
game/mods/dup_loser: undefined macro in the losing copy of a duplicate def -> LOADS_STATIC
game/mods/dup_loser_via: losing twin.def reaches an undefined macro through its include -> LOADS_STATIC (path order b loses, assumed)
game/mods/dup_winner_via: winning twin.def carries the include -> LIKELY_CRASH twin
game/mods/crash_set: undefined macro in resource/set/s.set -> LIKELY_CRASH, class LOAD
game/mods/pak_ok: clean def in resource.pak -> LOADS_STATIC, 1 of 1 paks read
game/mods/pak_crash: undefined macro in a def inside resource.pak -> LIKELY_CRASH tank_p
game/mods/pak_bad: resource.pak is not a zip -> UNKNOWN, named as unread
game/mods/stray_pak: extra.pak in mod root, never mounted -> LOADS_STATIC, named as ignored
game/mods/patched: 1.pat present -> LOADS_STATIC, says refcheck only read it
game/mods/req_missing: Require of a mod not installed -> UNKNOWN
game/mods/req_ok: Require of an installed mod -> LOADS_STATIC, mounted
game/mods/plus_on_legacy: legacy mod requires as64+ -> LIKELY_CRASH on as64 (ENG-26), UNKNOWN on mowas2
game/mods/bad_info: mod.info does not parse -> LIKELY_CRASH (ENG-24)
game/mods/no_info: no mod.info -> REFUSED
outside/packed: pak in a folder outside game/mods -> UNKNOWN, never LOADS_STATIC
outside/loose: loose files outside game/mods -> LOADS_STATIC, says not mounted
goh/mods/: range holds 1.067 -> LOADS_STATIC [I]
goh/mods/: 1.500..1.510 above 1.067 -> REFUSED
goh/mods/: AS2-scale 3.262 -> REFUSED
goh/mods/: Max 1.050 below 1.067 -> REFUSED
goh/mods/: any..any -> LOADS_STATIC
goh/mods/: Min only -> LOADS_STATIC, tagged [I]
goh/mods/: no range -> open on GoH (GHVFS-26 [V]), LOADS_STATIC
goh/mods/: pak the wrapped tools can't mount on GoH -> UNKNOWN
goh/mods/: undefined macro in entity def -> LIKELY_CRASH, tagged [I]
outside/: GoH mod outside <goh>/mods, resource/a.pak + localizations/ru.pak -> 2 of 2 paks read directly, LOADS_STATIC (GOHMOD-3)
outside/: same, undefined macro in a pak entry def -> LIKELY_CRASH naming resource/a.pak!entity/m/tank_w.def
game/mods/orph_macro: undefined macro in entity def nothing names -> LOADS_STATIC, tank_o ORPHAN (listed, not counted)
game/mods/orph_word: names tank_oo tank_o2 xtank_o only (not whole-word tank_o) -> ORPHAN, LOADS_STATIC
game/mods/orph_pak_ref: same def, named (other case) in map/m.mi inside resource.pak -> REACHABLE, LIKELY_CRASH
game/mods/orph_override: macro in an override of vanilla resource/entity/base/base.def -> REACHABLE, LIKELY_CRASH
game/mods/orph_mixed: two crash defs, one named in set/s.set -> LIKELY_CRASH counts 1, other ORPHAN
game/mods/core_inc: include only in as64/core -> LOADS_STATIC on as64, LIKELY_CRASH tank_c (INCLUDE_MISSING) on mowas2 (own pass, sdllint --exe mowas_2)
game/mods/core_weapon: weapon only in as64/core -> LOADS_STATIC on as64, LIKELY_CRASH tank_cw (REF_WEAPON_UNKNOWN) on mowas2 once refcheck takes --exe
goh/mods/: Tags "no_delete DEVELOP", Min 1.105 above exe 1.067 -> gate accepted (GHVFS-02), not REFUSED; mounted once lib/vfs reads Tags
goh/mods/: Tags "developer" is not the word develop -> REFUSED
goh/mods/: two Tags lines, develop in the first -> gate accepted and mounted (every Tags line counts, as lib/vfs)
game/mods/clean warm: no mod cache and no vanilla mowas_2 cache -> one vanilla refcheck warm run first (timing.mowas2.warm), same verdict; a second run does not warm; --no-warm never warms
game/mods/tag_develop: Tags develop on AS2, range 3.100-3.200 -> REFUSED on as64 and mowas2 (AS2 ignores Tags)
goh_noexe/mods/: GoH folder without its exe file (--exe-goh names it) -> mounted on the GoH rule (vfs exe goh), LOADS_STATIC
game/mods/req_skipped: Require nomax, which vfs skips first -> not mounted, the reason line names req_skipped itself
