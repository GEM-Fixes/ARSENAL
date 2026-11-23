# mow-mod-infantry: stances and soldier animations

when: "soldier can not go prone", "add a new stance", "wrong run animation", "new death animation", "soldier slides", "FSM warning at load", "new weapon needs an animation".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Animation files themselves (.anm, bones) → skill `mow-mod-models-effects` (`animations.md`).

## Steps
1. the sequences the human model has: MCP `mow_anim_list {model:"<human entity or breed:<key>>", q:"<part of a name>"}`
2. the stance graph that wins: MCP `mow_file_which {path:"properties/human.ext", mods:[..]}` and the `{FSM "human" ..}` it includes; rules: `mow_lookup {query:"humans/fsm", mode:"topic"}`
3. which names the engine asks for: MCP `mow_lookup {query:"humans/anim-choice", mode:"topic"}`
4. lint: `node tools/humlint/humlint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (HUM_FSM_SPLIT_ORDER, HUM_FSM_DYING_EDGES, HUM_DURATION_ZERO)
5. GUI: Models & Sim tab > `models` page, Animation editor (play a sequence on the human model)

## Facts
- orders never play animations: they ask the stance machine, which walks a stance graph given in data
```
{FSM "human" {Split 2} {Request "name" {priority N}{duration N}{exit "name"}{interrupt}}
 {Start "stand"}
 {State "name" {tag "t"} {to "s"}{from "s"}{transit "s"}{condition "req"}{split "a" "b"}}
 {subset "name" [from "base"] {enable "tag"}{disable "tag"}}}
```
- the engine picks animation NAMES in code from weapon mode, item, pose, alert, wounded: walk and run sets, aim poses, idles, deaths
- a new weapon that fits an existing mode tag needs no new animation; a new MOTION needs a sequence under a name the engine already asks for
- subsets switch stances off by tag (carrying an item, swimming)
- death animations are named by the effects in `human.inc`

## Per game
- as64 / mowas2: one human skeleton and animation set, same names
- goh: adds the interaction event `animation_event "name"` (GHINT-45) and seat hatches (GHHUM-39); its human animations need bone renames to play on the AS2 skeleton (→ skill `mow-mod-port`)

## Silently fails
- HUM-29 `Split` must come before any `{split}`; every non-dead stance needs exactly one edge into `dying`: else load warnings and a broken graph
- HUM-30 a new sequence name nothing asks for is never played
- HUM-31 a sequence with duration zero is refused; over 255 tracks is a file error
- HUM-28 subset `with_item` disables down and squat while carrying
- HUM-32 pistol run needs tag `shoot_walking`
- MOV-23 the swim pose only on water ground types
- FMT-09 a track for a bone the skeleton lacks is skipped
- a mod copy of the FSM file replaces the graph for every soldier

## Verify
- humlint clean; in game order the soldier through stand, squat, prone, run, swim and fire in each; watch for sliding or frozen poses; log has no FSM warning (→ skill `mow-mod-test`)
