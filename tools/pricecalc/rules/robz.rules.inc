; robz.rules.inc: pricecalc seed rules for RobZ Realism (1.31.x): every pick that belongs to this one mod.
; Use: node tools/pricecalc/pricecalc.js seed <robz mod> --game <AS2> --sheet-mp MP.tsv --sheet-cp CP.tsv --rules tools/pricecalc/rules/robz.rules.inc -o f
; Grammar: tools/pricecalc/rules.js header. Without this file the seed uses generic rules (stuff folder -> group) only.
; Sources: the owner's sheet (MP/CP 1.30.8), owner answers 2026-11, the mod's own price rows.
{price_rules
	{version 1}

	; ---- weapon groups (seed writes them in this order; sheet class ids match the sheet reader's) ----
	{weapon_group "radio" {label "Radio"} {skill "rifle"} {sole 1}}	; owner rule: radiomen are priced solely on their call-in item
	{weapon_group "snipers" {label "snipers"} {skill "rifle"} {cw_as "smg" "medium"}}	; read from the mod: sniper rows carry cw = the smg CP curve
	{weapon_group "flame" {label "Flame"} {skill "rifle"}}
	{weapon_group "at_rifles" {label "AT Rifles"} {skill "at_rifle"}}
	{weapon_group "at" {label "AT"} {skill "rocketlauncher"}}
	{weapon_group "mg" {label "Machine Guns"} {skill "mgun"}}
	{weapon_group "light_mortar" {label "light mortar"} {skill "rifle"}}
	{weapon_group "rifle_grenades" {label "Rifle Grenades"} {skill "rifle"}}
	{weapon_group "auto_rifle" {label "Auto rifle"} {skill "rifle"}}
	{weapon_group "carbines" {label "Carbines"} {skill "rifle"}}
	{weapon_group "smg" {label "SMG"} {skill "smg"}}
	{weapon_group "rifles" {label "Rifles"} {skill "rifle"}}
	{weapon_group "pistol" {label "pistol (not in the sheet)"} {skill "pistol"}
		{flat {tier "flat"} {label "owner rule: pistols have no tiers; not in the sheet (0 until set)"} {why "owner rule: pistols have no tiers"}}}
	{weapon_group "pzf" {label "pzf"} {skill "rocketlauncher"} {addon 1}}
	{main_priority "radio" "snipers" "flame" "at_rifles" "at" "mg" "light_mortar" "rifle_grenades" "auto_rifle" "carbines" "smg" "rifles" "pistol"}

	; ---- name patterns inside one stuff folder (first match wins) ----
	{class_by_name {stuff "bazooka"} {match "faust"} {group "pzf"} {forced 1}}
	{class_by_name {stuff "rifle"} {match "grenade|granat"} {group "rifle_grenades"} {forced 1} {why "name says grenade launcher"}
		{tier "medium"} {tier_why "owner rule: rifle grenade launcher = medium unless {when_carried}"}}
	{class_by_name {stuff "rifle"} {match "(_s|_sc|_scope|_s_vet|_s_elite|sniper)$"} {group "snipers"} {forced 1} {why "scoped name"}}
	{class_by_name {stuff "rifle"} {match "carbine|^vsg$"} {group "carbines"}}
	{class_by_name {stuff "rifle"} {match "^bar_rifle$|^fg42_rifle$|^johnson_m1941_rifle$"} {group "auto_rifle"} {why "automatic rifle (BAR / FG42 / Johnson LMG)"}}
	{tier_by_name {group "rifles"} {match "vet$"} {tier "vet"} {why "name ends _vet -> vet rifles"}}
	{not_weapon {stuff "flame"} {match "balloon"}}
	{not_weapon {stuff "pistol"} {match "kampfpistole"}}
	{call_in {group "radio"} {stuff "pistol"} {match "flare|flaer"} {not "kampfpistole"} {calibres 60 81 105 155 240} {undetermined_as "81"}
		{guess_match "mortar" "81 (mortar call-in without calibre) [I]"} {cp_from "Radio"}}

	; ---- which sheet classes an item of a stuff folder may match ----
	{sheet_match "smg" "smg" "carbines"}
	{sheet_match "rifle" "rifles" "carbines" "snipers" "auto_rifle" "rifle_grenades" "at_rifles" "smg"}
	{sheet_match "mgun" "mg"}
	{sheet_match "bazooka" "at" "pzf"}
	{sheet_match "flame" "flame"}
	{sheet_match "reactive" "light_mortar"}

	; ---- sheet Items spellings -> item name prefixes (no prefix = the token matches nothing) ----
	{sheet_alias "kar98" "mauzer"}
	{sheet_alias "leeenfield" "em3"}
	{sheet_alias "springfield" "m1903"}
	{sheet_alias "m1garand" "garand"}
	{sheet_alias "type4" "type4rifle"}
	{sheet_alias "svt" "svt40"}
	{sheet_alias "tera" "type2rifle"}
	{sheet_alias "carcanno" "carcano" "m38carcano" "m9138carcano"}
	{sheet_alias "manlicher" "mannlicher"}
	{sheet_alias "zb24" "zb24rifle"}
	{sheet_alias "type38" "type38rifle"}
	{sheet_alias "type99" "type99rifle" "type99mg"}
	{sheet_alias "type97" "type97mg" "type97antitank" "type97rifle"}
	{sheet_alias "feg" "feg"}
	{sheet_alias "m1bazooka" "bazooka"}
	{sheet_alias "m9bazooka" "bazookam9" "weaponbazookam9"}
	{sheet_alias "type4rocket" "type4at"}
	{sheet_alias "m18" "m18recoilless"}
	{sheet_alias "piat" "piatrocket"}
	{sheet_alias "panzershreck" "panzershreck" "panzerschreck"}
	{sheet_alias "vickerk" "vickersk"}
	{sheet_alias "m1919a6" "browningm19a6"}
	{sheet_alias "dp27" "dp"}
	{sheet_alias "zb26" "zbvz26"}
	{sheet_alias "zb30" "zb30"}
	{sheet_alias "type11" "type11mg"}
	{sheet_alias "type99scoped" "type99mgscoped"}
	{sheet_alias "breda30" "breda30"}
	{sheet_alias "boys" "boyes"}
	{sheet_alias "pzb" "pzb39"}
	{sheet_alias "type100" "type100"}
	{sheet_alias "thomson30" "thompson30"}
	{sheet_alias "thompson50" "thompson50"}
	{sheet_alias "danuavia" "danuvia"}
	{sheet_alias "mab38" "mab38"}
	{sheet_alias "type2" "type2smg"}
	{sheet_alias "m50reising" "m50reising"}
	{sheet_alias "owen" "owengun" "owen"}
	{sheet_alias "m1carbine" "m1carbine" "m1a1carbine"}
	{sheet_alias "volksgewher" "vsg"}
	{sheet_alias "type44" "type44carbine"}
	{sheet_alias "stg" "sg44" "stg" "mkb42" "mp43"}
	{sheet_alias "faust" "faustpatrone30" "panzerfaust30"}
	{sheet_alias "30"}
	{sheet_alias "60" "panzerfaust60"}
	{sheet_alias "100"}

	; ---- items the owner placed by hand (owner 2026-11-19: "set the remaining weapons as you thought") ----
	{item "thompson" {group "smg"} {tier "medium"}}
	{item "fg42_sc" {group "auto_rifle"} {tier "medium"} {why "owner 2026-11-19: an auto rifle (scoped FG42), not a sniper rifle"}}
	{extra_tier "carbines" "special" {copy "high"} {label "Special (owner 2026-11-19: M3 carbine is a special carbine) [I] seed copies high; the RobZ model holds its earlier sniper tables"}}
	{item "m3_carbine" {group "carbines"} {tier "special"} {why "owner 2026-11-19: special carbine"}}
	{item "mortar_legrw_36" {group "light_mortar"} {tier "medium"}}
	{item "mortar_mkvii" {group "light_mortar"} {tier "medium"}}
	{item "lsm26" {group "mg"} {tier "low"}}
	{item "type96_mg" {group "mg"} {tier "low"}}
	{item "panzerfaust" {group "pzf"} {tier "high"} {why "owner 2026-11-19: Panzerfaust 100 (entity panzerfaust100)"}}
	{item "airstrike_rp3_flaregun" {group "radio"} {tier "81"}}
	{item "mortar_flaergun" {group "radio"} {tier "81"}}
	{item "de_lisle" {group "rifles"} {tier "medium"}}
	{item "scottix" {group "rifles"} {tier "high"}}
	{item "m3a" {group "smg"} {tier "medium"}}
	{item "mp38" {group "smg"} {tier "medium"}}
	{item "orita" {group "smg"} {tier "medium"}}

	; ---- dummy weapons: breeds carrying them are priced by unit function ({special} blocks) ----
	{dummy "throwable_gun" {function "kamikaze"}}
	{dummy "lunge_mine" {function "lunge_mine"}}
	{equip_group "dummy_weapon" {label "dummy weapon (breed priced by unit function: {special} blocks)"}}

	; ---- equipment ----
	{equip_name {stuff "grenade"} {match "kasapanos"} {group "bundle_charge"}}
	{equip_group "scrape_shovel" {label "small shovel (digs a scrape): free, owner 2026-11-19"}}	; a new equipment group seeds with price 0
	{equip_name {stuff "special"} {match "^small_shovel$"} {group "scrape_shovel"}}
	{equip_guess "frag_grenade" {match "m39|oto_mod35|breda35|type99"} {tier "low"} {why "small offensive (egg) grenade"}}
	{equip_guess "frag_grenade" {match "m24|hungarian|type97"} {tier "medium"} {why "stick / standard grenade"}}
	{equip_guess "frag_grenade" {match "f1|mk1|m61"} {tier "high"} {why "heavy defensive frag"}}
	{equip_guess "at_grenade" {match "rpg40|n73at|breda42at"} {tier "low"} {why "blast AT grenade"}}
	{equip_guess "at_grenade" {match "rpg43|pwm1|type3at"} {tier "medium"} {why "shaped-charge AT grenade"}}
	{equip_guess "at_grenade" {match "hohlladung"} {tier "high"} {why "magnetic hollow charge"}}
	{equip_guess "bundle_charge" {match "rg42x3"} {tier "low"} {why "small bundle (3 heads)"}}
	{equip_guess "bundle_charge" {match "m24x5|kasapanos_2kg"} {tier "medium"} {why "bundle of 5 / 2 kg"}}
	{equip_guess "bundle_charge" {match "kasapanos_4kg|satchel"} {tier "high"} {why "heavy satchel / 4 kg"}}

	; ---- rifle grenade launchers: tier follows the ammo carried ----
	{extra_tier "rifle_grenades" "high" {copy "medium"} {label "[I] not in the sheet: copy of medium until the owner sets it"}}
	{when_carried "rifle_grenades" "high" "garand_grenade" {ammo "m1garand_grenade wp"} {note "owner rule: WP rifle grenade"}}
	{when_carried "rifle_grenades" "high" "k98_gewehrgranat" {ammo_ap 1}}

	; ---- throwables (owner rule: tier computed from the stuff file) [I] weights and cuts proposed ----
	{throwable_score {groups "frag_grenade" "smoke_grenade" "incendiary"} {energy 5} {penetration 0.1} {fire_radius 1} {range 0.2} {fuse -0.5} {cuts 10 20 40 80}}
	{throwable_score {groups "at_grenade" "bundle_charge"} {mode "armor"} {energy 5} {penetration 1} {cuts 30 60 100}}
	{throwable_price {mp_per_tier 0.05} {cp_per_tier 0.01} {note "owner rule: MP 0.05 per tier per throwable; CP 0.01 (a fifth of the earlier 0.05, owner 2026-11-19)"}}

	; ---- sheet singles rows -> breed-name patterns [I] ----
	{fixed_cp_match "vehicle support" "(^|_)vehicle_supporter"}
	{fixed_cp_match "elite tankcommander" "elite_tank_?commander"}
	{fixed_cp_match "elite tankman" "elite_tankman"}
	{fixed_cp_match "vet tankcommander" "vet_tank_?commander"}
	{fixed_cp_match "vet tankman" "vet_tankman"}
	{fixed_cp_match "tankcommander" "tank_?commander"}
	{fixed_cp_match "tankman" "tankman"}
	{fixed_cp_match "miner" "(^|_)(ap_|at_)?miner"}
	{fixed_cp_match "elite vehicle support" "elite_vehicle_supporter"}
	{fixed_cp_match "radio" "radio"}

	; ---- squads ----
	{addon "halftrack" {label "halftrack"} {match "halftrack" "^m3" "^m5" "m3a1" "m5a1" "m16"}}
	{addon "251" {label "251"} {match "251" "sdkfz_?251" "sd_kfz_251"}}
	{addon "truck" {label "truck"} {match "truck" "opel" "blitz" "gaz" "zis" "studebaker" "bedford" "gmc" "isuzu" "dodge"}}
	{addon "para" {label "para"} {match "airborne" "para" "spawner"}}
	{single "at_launcher" {classes "at"} {sheet "AT Launcher"}}
	{single "sniper_flame_at_rifle" {classes "snipers" "flame" "at_rifles"} {sheet "Sniper"}}
	{single "elite" {classes "*"} {min_level 6} {sheet "Elite"} {note "[I] elite = breed skill level 6+"}}
	{single "regular" {classes "*"} {sheet "Regular"}}
	{sheet_nation "eng" "eng"}
	{sheet_nation "usa" "usa"}
	{sheet_nation "ger" "ger"}
	{sheet_nation "rus" "rus"}
	{sheet_nation "rus guards" "rus_guard"}
	{sheet_nation "ss" "ger_ss"}
	{sheet_nation "jap" "jap"}
	{sheet_nation "ost" "ger2"}
	{sheet_nation "axis minors" "axis_minor"}
}
