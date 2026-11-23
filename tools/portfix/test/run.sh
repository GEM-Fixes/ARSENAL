#!/bin/sh
# seeded fixture: fake install + mod, loose only. built in a temp dir, nothing tracked
# Author: Imperator_Aug (ARSENAL, ia-a8a51eb4)
d=$(cd "$(dirname "$0")" && pwd); t=$(mktemp -d); ok=1
G="$t/game/resource/properties"; M="$t/mod/resource/properties"; mkdir -p "$G" "$M" "$t/game/resource/entity" "$t/mod/resource/entity"
printf '(define "kept" {mass 1})\r\n(define "lost" {mass 2})\r\n' > "$G/armor.ext"
printf '(define "kept" {mass 3})\r\n{perks {component "x"}}\r\n' > "$M/armor.ext"
printf '{mass 1}\r\n' > "$t/game/resource/entity/a.def"
printf '{mass 1}\r\n{newkey 2}\r\n' > "$t/mod/resource/entity/a.def"
P="node $d/../portfix.js"
$P keys "$t/mod" --game "$t/game" > "$t/k"
grep -q 'WARN_ENT_KEY_UNUSED perks x1' "$t/k" || { echo "keys: perks missed"; ok=0; }
grep -q 'WARN_ENT_KEY_UNUSED newkey x1' "$t/k" || { echo "keys: newkey missed"; ok=0; }
grep -q 'UNUSED mass' "$t/k" && { echo "keys: false positive"; ok=0; }
$P mergedefs "$t/mod" --game "$t/game" --dry > "$t/m"
grep -q 'MERGED_DEFINES lost$' "$t/m" || { echo "merge: lost not found"; ok=0; }
grep -q '"lost"' "$M/armor.ext" && { echo "merge: dry run wrote"; ok=0; }
$P mergedefs "$t/mod" --game "$t/game" --also "$t/fix" > /dev/null
grep -q '"lost"' "$M/armor.ext" || { echo "merge: not written"; ok=0; }
grep -q '{mass 3}' "$M/armor.ext" || { echo "merge: mod define overwritten"; ok=0; }
[ "$(grep -c '"kept"' "$M/armor.ext")" = 1 ] || { echo "merge: duplicate define"; ok=0; }
[ -f "$t/fix/properties/armor.ext" ] || { echo "merge: --also missing"; ok=0; }
$P mergedefs "$t/mod" --game "$t/game" | grep -q '^0 files' || { echo "merge: not idempotent"; ok=0; }
$P mergedefs "$t/game" --game "$t/game" > /dev/null 2>&1 && { echo "merge: install not refused"; ok=0; }
S="$t/game/resource/set"; N="$t/mod/resource/set"; mkdir -p "$S" "$N"
printf '{tbl\r\n(define "m" {r %%v})\r\n(include "x.inc")\r\n}\r\n' > "$S/t.set"
printf '{"lost" ("m" v(1))}\r\n{"both" {r 1}}\r\n' > "$S/x.inc"
printf '{tbl\r\n{"both" {r 9}}\r\n}\r\n' > "$N/t.set"
printf '{shape\r\n{"a" 1}\r\n}\r\n' > "$S/s.set"; printf '{shape\r\n(x)\r\n}\r\n' > "$N/s.set"
$P mergetables "$t/mod" --game "$t/game" --dry > "$t/d"
grep -q 'MERGED_TABLE lost$' "$t/d" || { echo "tables: lost not found"; ok=0; }
grep -q '"lost"' "$N/t.set" && { echo "tables: dry run wrote"; ok=0; }
grep -q 's.set: WARN_TABLE_SHAPE' "$t/d" || { echo "tables: shape not warned"; ok=0; }
$P mergetables "$t/mod" --game "$t/game" > /dev/null
[ "$(tail -c 3 "$N/t.set" | head -c 1)" = "}" ] || { echo "tables: not inside the table"; ok=0; }
grep -q 'define "m"' "$N/t.set" || { echo "tables: macro not carried"; ok=0; }
grep -q '{r 9}' "$N/t.set" && [ "$(grep -c '"both"' "$N/t.set")" = 1 ] || { echo "tables: existing entry touched"; ok=0; }
$P mergetables "$t/mod" --game "$t/game" | grep -q '^0 files' || { echo "tables: not idempotent"; ok=0; }
A="$t/game/resource/set/stuff/mgun"; B="$t/mod/resource/set/stuff/mgun"; mkdir -p "$A" "$B"
printf '(define "kept_macro" {mass 1})\r\n' > "$B/.presets"
printf '{weapon_bullet\r\n{entity "own"}\r\n}\r\n' > "$B/pattern.mgun"
printf '{from "pattern mgun"\r\n{entity "old"}\r\n{zzbadkey 1}\r\n("kept_macro")\r\n("gone_macro")\r\n("van_macro")\r\n}\r\n' > "$A/old_gun"
printf '(define "van_macro" {mass 4} ("van_inner"))\r\n(define "van_inner" {mass 5})\r\n' > "$A/.presets"
printf '{bullet\r\n{entity "x"}\r\n}\r\n' > "$A/pattern.mgun.old"
printf '{item}\r\n' > "$B/old_gun"
$P carrystuff "$t/mod" --game "$t/game" --dry > "$t/c"
grep -q 'WARN_CARRY_DROP_KEY zzbadkey x1' "$t/c" || { echo "carry: bad key kept"; ok=0; }
grep -q 'WARN_CARRY_DROP_MACRO gone_macro x1' "$t/c" || { echo "carry: lost macro kept"; ok=0; }
grep -q 'pattern.mgun.old: WARN_CARRY_DISPLACES' "$t/c" || { echo "carry: displacement missed"; ok=0; }
grep -q '{item}' "$B/old_gun" || { echo "carry: dry run wrote"; ok=0; }
$P carrystuff "$t/mod" --game "$t/game" --also "$t/fx2" > /dev/null
grep -q 'from "pattern mgun"' "$B/old_gun" || { echo "carry: stub not replaced"; ok=0; }
grep -q 'entity "old"' "$B/old_gun" && grep -q 'kept_macro' "$B/old_gun" || { echo "carry: record lost"; ok=0; }
grep -q 'zzbadkey\|gone_macro' "$B/old_gun" && { echo "carry: not filtered"; ok=0; }
grep -q 'define "van_macro"' "$B/old_gun" && grep -q 'define "van_inner"' "$B/old_gun" || { echo "carry: vanilla macro not carried"; ok=0; }
grep -q 'entity "own"' "$B/pattern.mgun" || { echo "carry: mod file touched"; ok=0; }
grep -q 'entity "own"' "$B/pattern.mgun.old" && grep -q '.presets' "$B/pattern.mgun.old" || { echo "carry: displacing file wrong"; ok=0; }
[ -f "$t/fx2/set/stuff/mgun/old_gun" ] || { echo "carry: --also missing"; ok=0; }
$P carrystuff "$t/mod" --game "$t/game" | grep -q '^0 files' || { echo "carry: not idempotent"; ok=0; }
V="$t/game/resource/set/vision"; W="$t/mod/resource/set/vision"; mkdir -p "$V" "$W"
printf '{terms\r\n{gone property "tag"}\r\n{both property "tag"}\r\n}\r\n' > "$V/settings.set"
printf '{terms\r\n{both property "tag"}\r\n}\r\n' > "$W/settings.set"
$P mergetables "$t/mod" --game "$t/game" > /dev/null
grep -q 'gone property' "$W/settings.set" || { echo "tables: term not merged"; ok=0; }
[ "$(grep -c 'both property' "$W/settings.set")" = 1 ] || { echo "tables: term duplicated"; ok=0; }
H="$t/mod/resource/properties/animation/human"; mkdir -p "$H/loco/jog" "$H/loco/one"
printf 'x' > "$H/loco/jog/anim_2hand_var1.anm"; printf 'x' > "$H/loco/jog/anim_2hand.anm"; printf 'x' > "$H/loco/jog/anim_1hand.anm"; printf 'x' > "$H/loco/one.anm"
printf '{sequence "a" {file "loco\\jog"}}\r\n{sequence "b" {file "loco\\one"}}\r\n{sequence "c" {file "loco\\gone"}}\r\n;{sequence "d" {file "loco\\commented"}}\r\n' > "$H/_reg.inc"
$P anmdirs "$t/mod" --game "$t/game" --dry > "$t/a"
grep -q '_reg.inc: WARN_PORT_ANM_DIR x2' "$t/a" || { echo "anm: dir missed"; ok=0; }
grep -q 'WARN_ANM_MISSING .*loco/gone' "$t/a" || { echo "anm: missing not warned"; ok=0; }
grep -q 'commented' "$t/a" && { echo "anm: read a comment"; ok=0; }
grep -q 'loco.jog"' "$H/_reg.inc" || { echo "anm: dry run wrote"; ok=0; }
$P anmdirs "$t/mod" --game "$t/game" --also "$t/fx3" > /dev/null
grep -q 'jog.anim_2hand.anm"' "$H/_reg.inc" || { echo "anm: wrong pick"; ok=0; }
grep -q 'loco.one.anm"' "$H/_reg.inc" || { echo "anm: bare ref not given .anm"; ok=0; }
[ -f "$t/fx3/properties/animation/human/_reg.inc" ] || { echo "anm: --also missing"; ok=0; }
$P anmdirs "$t/mod" --game "$t/game" | grep -q '^0 files' || { echo "anm: not idempotent"; ok=0; }
grep -q 'sequence "a__anim_2hand_var1" {file "loco.jog.anim_2hand_var1.anm"}' "$H/_reg.inc" || { echo "anm: variant sequence missing"; ok=0; }
grep -q 'sequence "a__anim_1hand" {file "loco.jog.anim_1hand.anm"}' "$H/_reg.inc" || { echo "anm: 1hand variant missing"; ok=0; }
[ "$(grep -c 'sequence "a' "$H/_reg.inc")" = 3 ] || { echo "anm: variant count"; ok=0; }
grep -q 'sequence "b__' "$H/_reg.inc" && { echo "anm: single file got variants"; ok=0; }
printf '{sequence "p" {file "loco\\jog"} {speed 2} ; {x}\r\n\t{resume}\r\n}\r\n{sequence "q" {file "loco\\jog"}}\r\n' > "$H/_p.inc"
$P anmdirs "$t/mod" --game "$t/game" --prefer 1hand > "$t/a2"
grep -q 'sequence "p" {file "loco.jog.anim_1hand.anm"} {speed 2}' "$H/_p.inc" || { echo "anm: --prefer ignored"; ok=0; }
grep -q 'sequence "p__anim_2hand" {file "loco.jog.anim_2hand.anm"} {speed 2}' "$H/_p.inc" || { echo "anm: variant lost the options"; ok=0; }
grep -c 'resume' "$H/_p.inc" | grep -q '^3$' || { echo "anm: multi-line block not copied whole"; ok=0; }
printf '{sequence "s" {file "loco\\jog"}}\r\n' > "$H/_s.inc"
$P anmdirs "$t/mod" --game "$t/game" --single > /dev/null
grep -q 'sequence "s__' "$H/_s.inc" && { echo "anm: --single added variants"; ok=0; }
C="$t/cl"; mkdir -p "$C/game/resource/properties" "$C/game/resource/entity" "$C/mod/resource/properties" "$C/mod/resource/entity"
printf '(define "shield" {armor {thickness %%0}})\r\n(define "same" {a 1})\r\n(define "dep" ("shield" args 3))\r\n' > "$C/game/resource/properties/v.ext"
printf '(define "shield" {volume %%0 {thickness %%1}})\r\n(define "same" {a  1})\r\n(define "dep" {b 1})\r\n("shield" args "x" 2)\r\n' > "$C/mod/resource/properties/v.ext"
printf '(include "/properties/v.ext")\r\n("shield" args 10)\r\n("same")\r\n' > "$C/game/resource/entity/van.def"
printf '(include "/properties/v.ext")\r\n("dep")\r\n("eqm")\r\n(include "/properties/w.ext")\r\n("other" fx("shield"))\r\n' > "$C/game/resource/entity/van2.def"
printf '(define "eqm" {q 1})\r\n(define "other" {o %%fx})\r\n' > "$C/game/resource/properties/w.ext"
printf '(define "eqm" {q 1})\r\n(define "other" {o %%fx})\r\n' > "$C/mod/resource/properties/w.ext"
printf '(define "eqm" {q 2})\r\n' >> "$C/mod/resource/properties/v.ext"; printf '(define "eqm" {q 1})\r\n' >> "$C/game/resource/properties/v.ext"
printf '(include "/properties/v.ext")\r\n("shield" args "y" 4)\r\n' > "$C/game/resource/entity/both.def"; cp "$C/game/resource/entity/both.def" "$C/mod/resource/entity/both.def"
$P macroclash "$C/mod" --game "$C/game" --dry > "$t/c"
grep -q 'shield: WARN_MACRO_CLASH x[0-9]* properties/v.ext' "$t/c" || { echo "clash: shield missed"; ok=0; }
grep -q '^same' "$t/c" && { echo "clash: whitespace counted"; ok=0; }
[ -f "$C/mod/resource/entity/van.def" ] && { echo "clash: dry run wrote"; ok=0; }
$P macroclash "$C/mod" --game "$C/game" --also "$t/fx4" > /dev/null
grep -q '"as2_shield" args 10' "$C/mod/resource/entity/van.def" || { echo "clash: caller not renamed"; ok=0; }
grep -q '"same")' "$C/mod/resource/entity/van.def" || { echo "clash: same renamed"; ok=0; }
grep -q 'args "y" 4' "$C/mod/resource/entity/both.def" && grep -q '"shield"' "$C/mod/resource/entity/both.def" || { echo "clash: mod caller touched"; ok=0; }
grep -q '("shield" args "x" 2)' "$C/mod/resource/properties/v.ext" || { echo "clash: mod body touched"; ok=0; }
grep -q 'define "as2_shield" {armor' "$C/mod/resource/properties/v.ext" || { echo "clash: vanilla body missing"; ok=0; }
grep -q 'define "as2_dep" ("as2_shield" args 3)' "$C/mod/resource/properties/v.ext" || { echo "clash: nested not renamed"; ok=0; }
[ -f "$t/fx4/entity/van.def" ] || { echo "clash: --also missing"; ok=0; }
grep -q 'fx("shield")' "$C/mod/resource/entity/van2.def" || { echo "clash: parameter renamed"; ok=0; }
grep -q 'define "as2_eqm"' "$C/mod/resource/properties/w.ext" || { echo "clash: equal-body definer not given as2_"; ok=0; }
$P macrocheck "$C/mod" --game "$C/game" > "$t/mc"
grep -q ' 0 undefined macros' "$t/mc" || { echo "macrocheck: false hit"; cat "$t/mc"; ok=0; }
printf '("nowhere" fx("alsono"))\r\n(include "gone.inc")\r\n' > "$C/mod/resource/entity/bad.def"
$P macrocheck "$C/mod" --game "$C/game" > "$t/mc"
grep -q 'WARN_MACRO_UNDEFINED nowhere x1' "$t/mc" || { echo "macrocheck: undefined missed"; ok=0; }
grep -q 'alsono' "$t/mc" && { echo "macrocheck: parameter read as call"; ok=0; }
grep -q 'WARN_INCLUDE_MISSING entity/gone.inc' "$t/mc" || { echo "macrocheck: include missed"; ok=0; }
rm "$C/mod/resource/entity/bad.def"
printf '(define "elsewhere" {e 1} ("deeper"))\r\n(define "deeper" {d 1})\r\n' > "$C/mod/resource/properties/z.inc"
printf '{r\r\n("elsewhere")\r\n}\r\n' > "$C/mod/resource/entity/lost.def"
$P macrocheck "$C/mod" --game "$C/game" --fix --also "$t/fx5" > "$t/mc"
grep -q 'define "deeper"' "$C/mod/resource/entity/lost.def" || { echo "macrocheck: fix missed the nested macro"; ok=0; }
[ -f "$t/fx5/entity/lost.def" ] || { echo "macrocheck: fix --also missing"; ok=0; }
$P macrocheck "$C/mod" --game "$C/game" | grep -q ' 0 undefined macros' || { echo "macrocheck: fix not complete"; ok=0; }
$P macroclash "$C/mod" --game "$C/game" | grep -q ' 0 caller files, 0 tails, 0 defines' || { echo "clash: not idempotent"; ok=0; }
# vanprops: vanilla entity keeps vanilla's chain, the mod's own entity keeps the mod's
V="$C/game/resource"; W="$C/mod/resource"
printf '{Chassis "wheel"}\r\n' > "$V/properties/q.ext"; printf '{Plain 1}\r\n' > "$W/properties/q.ext"
printf '(include "q.ext")\r\n' > "$V/properties/q2.ext"
printf '{alone 1}\r\n' > "$V/properties/alone.ext"
printf '(include "/properties/q2.ext")\r\n{Chassis {Locomotion 1}}\r\n' > "$V/entity/vq.def"
printf '(include "/properties/alone.ext")\r\n' > "$V/entity/vu.def"
printf '(include "/properties/q2.ext")\r\n' > "$V/entity/both.def"; printf '(include "/properties/q.ext")\r\n{goh 1}\r\n' > "$W/entity/both.def"
printf '(include "/properties/q2.ext")\r\n' > "$V/entity/same.def"; cp "$V/entity/same.def" "$W/entity/same.def"
$P vanprops "$C/mod" --game "$C/game" --dry > "$t/vp"; [ -f "$W/entity/vq.def" ] && { echo "vanprops: dry wrote"; ok=0; }
$P vanprops "$C/mod" --game "$C/game" --also "$t/fx6" > "$t/vp"
grep -q '/properties/as2van/properties/q2.ext' "$W/entity/vq.def" || { echo "vanprops: caller not pointed"; ok=0; }
grep -q '/properties/as2van/properties/q.ext' "$W/properties/as2van/properties/q2.ext" || { echo "vanprops: relative include in a copy"; ok=0; }
grep -q 'wheel' "$W/properties/as2van/properties/q.ext" || { echo "vanprops: copy is not vanilla"; ok=0; }
[ -f "$W/properties/as2van/properties/q2.ext" ] || { echo "vanprops: reaching file not copied"; ok=0; }
[ -f "$W/entity/vu.def" ] && { echo "vanprops: untouched chain copied"; ok=0; }
grep -q 'goh 1' "$W/entity/both.def" && ! grep -q as2van "$W/entity/both.def" || { echo "vanprops: mod's own entity changed"; ok=0; }
grep -q 'as2van' "$W/entity/same.def" || { echo "vanprops: byte-equal vanilla copy left on the mixed chain"; ok=0; }
[ -f "$t/fx6/entity/vq.def" ] || { echo "vanprops: --also missing"; ok=0; }
grep -q 'Plain' "$W/properties/q.ext" || { echo "vanprops: mod's file changed"; ok=0; }
$P vanprops "$C/mod" --game "$C/game" | grep -q ' 0 copies written.* 0 caller files' || { echo "vanprops: not idempotent"; ok=0; }
$P macrocheck "$C/mod" --game "$C/game" | grep -q ' 0 undefined macros' || { echo "vanprops: macrocheck not clean"; ok=0; }
# extenders + ebmframes
printf '{Extender "shield" {a 1}}\r\n' > "$V/entity/ve.def"
printf '{r\r\n{Extender "shield" {a 1}}\r\n{Extender "nosuch" {b {c "}"}} ; x }\r\n}\r\n{keep 1}\r\n' > "$W/entity/e1.def"
$P extenders "$C/mod" --game "$C/game" --also "$t/fx7" > "$t/ex"
grep -q 'WARN_EXTENDER_UNKNOWN nosuch x1' "$t/ex" || { echo "extenders: nosuch missed"; ok=0; }
grep -q nosuch "$W/entity/e1.def" && { echo "extenders: block kept"; ok=0; }
grep -q 'keep 1' "$W/entity/e1.def" && grep -q '"shield"' "$W/entity/e1.def" || { echo "extenders: dropped too much"; ok=0; }
[ -f "$t/fx7/entity/e1.def" ] || { echo "extenders: --also missing"; ok=0; }
$P extenders "$C/mod" --game "$C/game" | grep -q '^0 files' || { echo "extenders: not idempotent"; ok=0; }
# --engine: registrations read from a seeded src tree; a macro #define is not a registration
[ -f "$d/../srcnames.js" ] && [ -f "$d/srcnames.sh" ] && . "$d/srcnames.sh"   # checks of an optional side file
mkdir -p "$V/properties/sel" "$W/properties/sel"
printf '{bitmap\n{Frame "a1.tga" 200}\n}\n' > "$V/properties/sel/a.ebm"; printf 'x' > "$V/properties/sel/a1.tga"
printf '{bitmap\n{Frame "gone.dds" 200}\n;{Frame "c.tga"}\n}\n' > "$W/properties/sel/a.ebm"
printf '{bitmap\n{Frame "gone2.dds"}\n}\n' > "$W/properties/sel/b.ebm"
printf '{bitmap\n{Frame "a1.tga"}\n{Frame "$/x.dds"}\n}\n' > "$W/properties/sel/ok.ebm"
$P ebmframes "$C/mod" --game "$C/game" > "$t/eb"
grep -q 'a1.tga' "$W/properties/sel/a.ebm" || { echo "ebmframes: vanilla not used"; ok=0; }
grep -q 'b.ebm: WARN_EBM_FRAME_MISSING gone2.dds' "$t/eb" || { echo "ebmframes: missing not warned"; ok=0; }
grep -q 'ok.ebm: WARN_EBM_FRAME_MISSING' "$t/eb" && { echo "ebmframes: false hit"; ok=0; }
grep -q 'ok.ebm: WARN_EBM_FRAME_SUBST 1 frames' "$t/eb" || { echo "ebmframes: \$/ frame not reported"; ok=0; }
# minworkers + shapes
printf '{place "g"\r\n{charger "c g" minWorkers 1}\r\n{gunner "g"} ; minWorkers 2\r\n}\r\n' > "$W/entity/mw.def"
printf '{place "g"\r\n{charger "c g"}\r\n}\r\n' > "$V/entity/mw2.def"
$P shapes "$C/mod" --game "$C/game" > "$t/sh"
grep -q 'WARN_SHAPE_WORD place/charger minworkers' "$t/sh" || { echo "shapes: minworkers missed"; ok=0; }
$P minworkers "$C/mod" --game "$C/game" --also "$t/fx8" > "$t/mw"
grep -q '^1 files, 1 minWorkers' "$t/mw" || { echo "minworkers: count"; ok=0; }
grep -q 'minWorkers 1' "$W/entity/mw.def" && { echo "minworkers: kept"; ok=0; }
grep -q '; minWorkers 2' "$W/entity/mw.def" || { echo "minworkers: comment changed"; ok=0; }
[ -f "$t/fx8/entity/mw.def" ] || { echo "minworkers: --also missing"; ok=0; }
# fxdup
printf '{particleview\r\n{generator {rate 1}}\r\n{mover {x "}"}}\r\n{entitygenerator {rate 2}}\r\n; {mover}\r\n}\r\n{particleview\r\n{entitygenerator {rate 3}}\r\n}\r\n' > "$W/entity/fd.def"
$P fxdup "$C/mod" --game "$C/game" --also "$t/fx9" > "$t/fd"
grep -q 'rate 2' "$W/entity/fd.def" && { echo "fxdup: second generator kept"; ok=0; }
grep -q 'rate 1' "$W/entity/fd.def" && grep -q 'rate 3' "$W/entity/fd.def" && grep -q 'mover {x' "$W/entity/fd.def" || { echo "fxdup: dropped too much"; ok=0; }
[ -f "$t/fx9/entity/fd.def" ] || { echo "fxdup: --also missing"; ok=0; }
$P fxdup "$C/mod" --game "$C/game" | grep -q '^0 files' || { echo "fxdup: not idempotent"; ok=0; }
# locospeed
printf '{Chassis\r\n{Locomotion\r\n{Slow 10} ; } odd\r\n{Fast (* 2 3)}\r\n{MaxSpeed 42}\r\n}\r\n}\r\n' > "$W/entity/lc.def"
$P locospeed "$C/mod" --game "$C/game" --also "$t/fx10" > "$t/lc"
grep -q '^1 files, 1 Locomotion' "$t/lc" || { echo "locospeed: count"; ok=0; }
grep -q '{Speed {Slow 10} {Fast (\* 2 3)}}' "$W/entity/lc.def" || { echo "locospeed: no Speed block"; ok=0; }
grep -q 'MaxSpeed 42' "$W/entity/lc.def" || { echo "locospeed: dropped MaxSpeed"; ok=0; }
$P locospeed "$C/mod" --game "$C/game" | grep -q '^0 files' || { echo "locospeed: not idempotent"; ok=0; }
# panelterms
mkdir -p "$C/mod/resource/set/panel_control"
printf '{panel_control\r\n{a {condition "human barricade disabled"}}\r\n{b {condition "engine vehicle"}}\r\n{c {condition "single"}}\r\n}\r\n' > "$C/mod/resource/set/panel_control/right_x.set"
$P panelterms "$C/mod" --game "$C/game" --also "$t/fx11" > "$t/pt"
grep -q 'dropped barricade x1' "$t/pt" || { echo "panelterms: barricade"; ok=0; }
grep -q 'condition "human disabled"' "$t/fx11/set/panel_control/right_x.set" || { echo "panelterms: drop text"; ok=0; }
grep -q 'condition "vehicle"}' "$t/fx11/set/panel_control/right_x.set" || { echo "panelterms: map text"; ok=0; }
grep -q 'condition "single"' "$t/fx11/set/panel_control/right_x.set" || { echo "panelterms: lost term"; ok=0; }
$P panelterms "$C/mod" --game "$C/game" | grep -q '^0 panel' || { echo "panelterms: not idempotent"; ok=0; }
# mtlkeys
mkdir -p "$t/ms/entity/a"
printf '{material "bump"\r\n\t{diffuse "a"}\r\n\t{lightmap "$/_lm/x"}\r\n\t{full_specular}\r\n\t{glow 2}\r\n}\r\n' > "$t/ms/entity/a/b.mtl"
printf '{material "envmap"\r\n\t{mask "m"}\r\n}\r\n' > "$t/ms/entity/a/e.mtl"
printf '{material "simple"\r\n\t{diffuse "a"}\r\n\t{mask "m"}\r\n}\r\n' > "$t/ms/entity/a/s.mtl"
$P mtlkeys "$t/mo" --game "$C/game" --src "$t/ms" > "$t/mk"
grep -q '^2 of 3 mtl' "$t/mk" || { echo "mtlkeys: count"; ok=0; }
grep -qi 'lightmap\|full_specular' "$t/mo/entity/a/b.mtl" && { echo "mtlkeys: key left"; ok=0; }
grep -q 'glow 2' "$t/mo/entity/a/b.mtl" || { echo "mtlkeys: dropped a native key"; ok=0; }
grep -q 'mask' "$t/mo/entity/a/s.mtl" && { echo "mtlkeys: simple mask left"; ok=0; }
[ -e "$t/mo/entity/a/e.mtl" ] && { echo "mtlkeys: envmap changed"; ok=0; }
$P mtlkeys "$t/ms/entity" --game "$C/game" --src "$t/ms" 2>/dev/null && { echo "mtlkeys: wrote into source"; ok=0; }
# mdlkeys
mkdir -p "$t/ds/entity/a"
printf '{skeleton\r\n\t{bone "b"\r\n\t\t{animation\r\n\t\t\t{sequence "open" {speed 0.2}{events {2 "x"} {46 "y"}}}\r\n\t\t}\r\n\t}\r\n}\r\n{obstacle "o"\r\n\t{obstacleID "small"}\r\n\t{tags "k"}\r\n}\r\n' > "$t/ds/entity/a/m.mdl"
printf '{skeleton\r\n\t{bone "b"}\r\n}\r\n' > "$t/ds/entity/a/n.mdl"
printf 'x {events} {lightmap "a"}\r\n' > "$t/ds/entity/a/not.def"
$P mdlkeys "$t/do" --game "$C/game" --src "$t/ds" > "$t/dk"
grep -q '^1 of 2 mdl' "$t/dk" || { echo "mdlkeys: count"; ok=0; }
grep -qi 'events\|obstacleid' "$t/do/entity/a/m.mdl" && { echo "mdlkeys: key left"; ok=0; }
grep -q 'speed 0.2' "$t/do/entity/a/m.mdl" || { echo "mdlkeys: dropped too much"; ok=0; }
grep -q 'tags "k"' "$t/do/entity/a/m.mdl" || { echo "mdlkeys: dropped tags"; ok=0; }
[ -e "$t/do/entity/a/not.def" ] && { echo "mdlkeys: touched another kind"; ok=0; }
# volmats
mkdir -p "$t/vg/resource/set" "$t/vs/set"
printf '{materials\r\n\t{"steel"\r\n\t\t{steelEquivalent 0.1}\r\n\t}\r\n\t{"dummy"}\r\n}\r\n' > "$t/vg/resource/set/material.set"
printf '{materials\r\n\t{"steel" {steelEquivalent 9}}\r\n\t{"glass"\r\n\t\t{wound {stage "a.mtl" {"b.mtl" 5} 1}}\r\n\t}\r\n}\r\n' > "$t/vs/set/material.set"
$P volmats "$t/vo" --game "$t/vg" --src "$t/vs" > "$t/vk"
grep -q '^added glass' "$t/vk" || { echo "volmats: count"; ok=0; }
grep -q 'steelEquivalent 0.1' "$t/vo/set/material.set" || { echo "volmats: base lost"; ok=0; }
grep -q 'steelEquivalent 9' "$t/vo/set/material.set" && { echo "volmats: overwrote base"; ok=0; }
grep -q 'stage "a.mtl" "b.mtl" 1' "$t/vo/set/material.set" || { echo "volmats: stage form"; ok=0; }
# viewkeys
mkdir -p "$t/ks/entity/fx"
printf '{fx\r\n\t{#+ lightview\r\n\t\t{type point}\r\n\t\t{timetolive 5}\r\n\t}\r\n\t{particleview\r\n\t\t{generator\r\n\t\t\t{timetolive 7}\r\n\t\t}\r\n\t\t{entitygenerator\r\n\t\t\t{entity "e"\r\n\t\t\t\t{frequency 2}\r\n\t\t\t\t{spinx 1}{spiny 1}\r\n\t\t\t\t{align}\r\n\t\t\t}\r\n\t\t\t{timetolive 8}\r\n\t\t}\r\n\t}\r\n\t{##lightview {timetolive 9}}\r\n}\r\n' > "$t/ks/entity/fx/a.def"
printf '{fx {generator {timetolive 7}}}\r\n' > "$t/ks/entity/fx/b.def"
$P viewkeys "$t/ko" --game "$t/vg" --src "$t/ks" > "$t/kk"
grep -q '^1 of 2 def' "$t/kk" || { echo "viewkeys: count"; ok=0; }
grep -q 'timetolive 5\|spinx\|spiny\|align' "$t/ko/entity/fx/a.def" && { echo "viewkeys: key left"; ok=0; }
for k in 'timetolive 7' 'timetolive 8' 'timetolive 9' 'frequency 2' 'type point'; do grep -q "$k" "$t/ko/entity/fx/a.def" || { echo "viewkeys: lost $k"; ok=0; }; done
# resupply
mkdir -p "$t/rs/properties" "$t/rs/entity/a"
printf '(define "x"\r\n\t{item "mp40" "ammo" 32 {value 2}}\r\n\t{item "b" 1 {max 3} {value 1}}\r\n)\r\n' > "$t/rs/properties/r.inc"
printf '{entity {inventory {item "mp40" 3}}}\r\n' > "$t/rs/entity/a/a.def"
$P resupply "$t/ro" --game "$t/vg" --src "$t/rs" > "$t/rk"
grep -q 'item "mp40" "ammo" 32 {max 128} {value 2}' "$t/ro/properties/r.inc" || { echo "resupply: form"; ok=0; }
grep -q 'item "b" 1 {max 3} {value 1}' "$t/ro/properties/r.inc" || { echo "resupply: touched existing max"; ok=0; }
[ -e "$t/ro/entity/a/a.def" ] && { echo "resupply: touched inventory"; ok=0; }
# bones
mkdir -p "$t/bs/e/a" "$t/bs/e/b"
printf '{skeleton\r\n\t{bone "has"}\r\n\t{bone revolute "rot"}\r\n}\r\n' > "$t/bs/e/a/a.mdl"
printf '{e\r\n\t{extension "a.mdl"}\r\n\t(include "a.ext")\r\n\t{bone "has" {speed2 1}}\r\n\t{bone "rot" {speed2 2}}\r\n\t{bone "no" {speed2 3}}\r\n\t{bone "alsono"}\r\n}\r\n' > "$t/bs/e/a/a.def"
printf '{bone "gone" {speed2 4}}\r\n' > "$t/bs/e/a/a.ext"
printf '{e\r\n\t{bone "nomodel" {speed2 5}}\r\n}\r\n' > "$t/bs/e/b/b.def"
mkdir -p "$t/bs/e/c" "$t/bs/e/d"
printf '(define "gun_mod"\r\n\t{bone "zz" {speed2 1}}\r\n)\r\n' > "$t/bs/e/m.ext"
printf '{skeleton\r\n\t{bone "has"}\r\n}\r\n' > "$t/bs/e/c/c.mdl"
printf '{skeleton\r\n\t{bone "zz"}\r\n}\r\n' > "$t/bs/e/d/d.mdl"
printf '{e\r\n\t{extension "c.mdl"}\r\n\t(include "../m.ext")\r\n\t("gun_mod")\r\n\t{bone "has" {speed2 1}}\r\n}\r\n' > "$t/bs/e/c/c.def"
printf '{e\r\n\t{extension "d.mdl"}\r\n\t(include "../m.ext")\r\n\t("gun_mod")\r\n}\r\n' > "$t/bs/e/d/d.def"
$P bones "$t/bo" --game "$t/vg" --src "$t/bs" > "$t/bk"
grep -q 'gun_mod' "$t/bo/e/c/c.def" && { echo "bones: macro call on missing bone kept"; ok=0; }
[ -e "$t/bo/e/d/d.def" ] && { echo "bones: touched caller whose model has the bone"; ok=0; }
[ ! -e "$t/bo/e/m.ext" ] || grep -q 'bone "zz"' "$t/bo/e/m.ext" || { echo "bones: shared macro block cut"; ok=0; }
grep -q 'dropped 2 blocks in 2 files' "$t/bk" || { echo "bones: count"; ok=0; }
grep -q 'speed2 3' "$t/bo/e/a/a.def" && { echo "bones: missing bone left"; ok=0; }
grep -q 'bone "has"' "$t/bo/e/a/a.def" || { echo "bones: dropped a real bone"; ok=0; }
grep -q 'bone "rot"' "$t/bo/e/a/a.def" || { echo "bones: typed bone not seen"; ok=0; }
grep -q 'alsono' "$t/bo/e/a/a.def" || { echo "bones: empty block is safe, keep"; ok=0; }
[ -e "$t/bo/e/b/b.def" ] && { echo "bones: touched entity with no model"; ok=0; }
# locospeed, macro form
mkdir -p "$t/ld/resource/properties"
printf '{Chassis "railway"\n}\n(define "locomotion"\n\t{Slow 10}\t;// kmh\n\t{MaxSpeed 30}\n)\n' > "$t/ld/resource/properties/rail.ext"
$P locospeed "$t/ld" --game "$C/game" > "$t/ldo"
grep -q '{Speed {Slow 10}}' "$t/ld/resource/properties/rail.ext" || { echo "locospeed define: no Speed"; ok=0; }
sed -n '/define/,$p' "$t/ld/resource/properties/rail.ext" | grep -qi 'slow' && { echo "locospeed define: Slow left"; ok=0; }
grep -q 'MaxSpeed 30' "$t/ld/resource/properties/rail.ext" || { echo "locospeed define: lost MaxSpeed"; ok=0; }
# decalempty: empty block goes, comment-only block goes, a block with a sprite stays
mkdir -p "$t/de/resource/entity"
printf '{game_entity\n\t{DecalView\n\t\t;{ownershadow 64 64}\n\n\t}\n\t{mass 1}\n}\n' > "$t/de/resource/entity/a.def"
printf '{game_entity\n\t{DecalView\n\t\t{sprite "a.mtl"}\n\t}\n}\n' > "$t/de/resource/entity/b.def"
$P decalempty "$t/de" --game "$C/game" > "$t/deo"
grep -qi 'decalview' "$t/de/resource/entity/a.def" && { echo "decalempty: empty block left"; ok=0; }
grep -q 'mass 1' "$t/de/resource/entity/a.def" || { echo "decalempty: lost mass"; ok=0; }
grep -qi 'decalview' "$t/de/resource/entity/b.def" || { echo "decalempty: sprite block dropped"; ok=0; }
# fillcycle: weapon shadowing its bullet takes the bullet, self filling with no twin goes, normal filling stays
mkdir -p "$t/fc/resource/set/stuff/ammo" "$t/fc/resource/set/stuff/rifle" "$t/fc/resource/set/stuff/mortar"
printf '{weapon\n\t{filling "ammo shotgun" 2}\n}\n' > "$t/fc/resource/set/stuff/ammo/shotgun.ammo"
printf '{bullet\n\t{entity "x"}\n}\n' > "$t/fc/resource/set/stuff/rifle/shotgun.ammo"
printf '{weapon\n\t{filling "mortar"}\n\t{mass 1}\n}\n' > "$t/fc/resource/set/stuff/mortar/mortar.pattern"
printf '{weapon\n\t{filling "ammo shotgun"}\n}\n' > "$t/fc/resource/set/stuff/rifle/shotgun.gun"
$P fillcycle "$t/fc" --game "$C/game" > "$t/fco"
grep -q bullet "$t/fc/resource/set/stuff/ammo/shotgun.ammo" || { echo "fillcycle: bullet not swapped in"; ok=0; }
grep -q filling "$t/fc/resource/set/stuff/mortar/mortar.pattern" && { echo "fillcycle: self filling left"; ok=0; }
grep -q 'mass 1' "$t/fc/resource/set/stuff/mortar/mortar.pattern" || { echo "fillcycle: lost mass"; ok=0; }
grep -q filling "$t/fc/resource/set/stuff/rifle/shotgun.gun" || { echo "fillcycle: normal filling dropped"; ok=0; }
# --exe: as64 sees the defines only as64/core holds, mowas_2 and no --exe read <game>/resource only, goh and a bad word are refused
E="$t/exeview"; mkdir -p "$E/game/resource/entity" "$E/game/as64/core/resource/properties" "$E/mod/resource/entity"
printf '(define "coreonly" {mass 1})\r\n' > "$E/game/as64/core/resource/properties/c.inc"
printf '(include "/properties/c.inc")\r\n{r\r\n("coreonly")\r\n}\r\n' > "$E/mod/resource/entity/u.def"
$P macrocheck "$E/mod" --game "$E/game" --exe as64 > "$t/ea"
grep -q ' 0 undefined macros' "$t/ea" || { echo "exe as64: core define not seen"; cat "$t/ea"; ok=0; }
grep -q 'WARN_INCLUDE_MISSING' "$t/ea" && { echo "exe as64: core include not found"; ok=0; }
$P macrocheck "$E/mod" --game "$E/game" --exe mowas_2 > "$t/em"
grep -q 'WARN_MACRO_UNDEFINED coreonly x1' "$t/em" || { echo "exe mowas_2: core define seen"; cat "$t/em"; ok=0; }
$P macrocheck "$E/mod" --game "$E/game" --exe mowas2 | grep -q 'WARN_MACRO_UNDEFINED coreonly x1' || { echo "exe mowas2 (GUI id): not taken as mowas_2"; ok=0; }
$P macrocheck "$E/mod" --game "$E/game" > "$t/en"
cmp -s "$t/en" "$t/em" || { echo "exe: no --exe differs from the resource-only view"; ok=0; }
$P macrocheck "$E/mod" --game "$E/game" --exe goh > /dev/null 2> "$t/eg"; [ $? = 2 ] && grep -q 'portfix: not available for GoH' "$t/eg" || { echo "exe goh: not refused"; ok=0; }
$P macrocheck "$E/mod" --game "$E/game" --exe nope > /dev/null 2>&1; [ $? = 2 ] || { echo "exe bad word: not refused"; ok=0; }
printf '{materials\r\n{"base" {a 1}}\r\n}\r\n' > "$t/m0.set"; mkdir -p "$E/game/resource/set" "$E/game/as64/core/resource/set" "$E/gsrc/set"
cp "$t/m0.set" "$E/game/resource/set/material.set"
printf '{materials\r\n{"base" {a 1}}\r\n{"core" {a 2}}\r\n}\r\n' > "$E/game/as64/core/resource/set/material.set"
printf '{materials\r\n{"core" {a 3}}\r\n{"gohonly" {a 4}}\r\n}\r\n' > "$E/gsrc/set/material.set"
$P volmats "$E/mod" --game "$E/game" --src "$E/gsrc" --exe as64 --dry | grep -q '^added gohonly (dry)' || { echo "volmats exe as64: core material.set not the base"; ok=0; }
$P volmats "$E/mod" --game "$E/game" --src "$E/gsrc" --dry | grep -q '^added core gohonly (dry)' || { echo "volmats no --exe: view changed"; ok=0; }
rm -rf "$t"
[ $ok = 1 ] && echo PASS || echo FAIL
