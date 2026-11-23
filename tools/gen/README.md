# gen ops

`node tools/gen/gen.js spec.yaml --target as64 --game <AS2 dir> --out <mods dir>/<mod> [--plan]`. The full op list is in the head comment of `gen.js`; `gen --schema` prints every field. Tags: [V] untested or data, [I] inferred, [T] needs an in-game test.

Every op below:
- writes only through the mod overlay (`--out`);
- refuses with a named `GEN_*` code and writes nothing for that op;
- in `--plan`, lists each changed line as an info `GEN_PLAN_WRITE <key> +N: line` (binary files: their size).

## Unit ops (lib/ops-unit.js)

### iblock: interaction block of a cloned unit
- **Fields:** `entity` (the new unit), `like` (the unit whose block is copied).
- **Example:** `{op: iblock, entity: my_t34, like: t34_0}`. `gen --sample iblock` gives this with the clone step.
- **Writes:** every top-level `{"<like> tank"}`-style block in `set/interaction_entity/**.inc`. Each is copied under the new id, right after the original. The rest of each file is kept byte for byte.
- **Refuses:**
  - `GEN_IBLOCK_EXISTS`: the entity already has a block.
  - `GEN_IBLOCK_LIKE_MISSING`: the like has no block of its own.
  - `GEN_IBLOCK_ARGS`
- **Tag:** [V] data form. [T] the sounds play in game.

### macro: one argument of a macro call
- **Fields:**
  - `entity`
  - `macro`: the called name, or `include`.
  - `match` or `nth`: required when the def has several calls of that macro.
  - `arg`: a named argument such as `step(..)`, `args` for the numbers after `args`, or a position 1..n.
  - `value`
  - `add: true`: appends `arg(value)` when the call does not have it.
  - `rename`: makes the call use another macro.
- **Example:** `{op: macro, entity: t34_0, macro: tank_trace, arg: step, value: 0.7}`.
- **Writes:** the def, changed only inside that call. Quoting is kept. With `args`, an `_` keeps that value.
- **Refuses:**
  - `GEN_MACRO_NO_CALL`
  - `GEN_MACRO_AMBIGUOUS`
  - `GEN_MACRO_ARG_MISSING`
  - `GEN_MACRO_ARGC`
  - `GEN_MACRO_UNDEFINED`: no such define. `rename` looks in the file, its `(include ..)` files, `properties/**` and `set/breed/**/*.inc`; the message lists the defines there with a like name and their files (vanilla has only `veterancy_1`, in `set/breed/mp/<army>/veterancy_generic.inc`). Write the define first (a mod `.inc` the file includes), then rename: `{op: macro, entity: "file:resource/set/breed/mp/rus/rifle.set", macro: veterancy_1, rename: veterancy_2}`.
  - `GEN_MACRO_PARAM_MISSING`: the new define reads a `%param` that the call does not give.
  - `GEN_MACRO_ARGS`: also a rename to the macro the call already uses.
- **Warns:** `WARN_GEN_MACRO_ARG_UNUSED`
- **Tag:** [V] parse. [T] the effect in game.

### preset: game-mode economy and buy limits
- **Fields:**
  - `file`: a name under `set/multiplayer/games`, or a key.
  - `name`: a `(define "x")` or `{"x"}` preset, or `all`.
  - `set`: `{path: value}`. The path is a chain of block names, such as `unitLimits` or `budgets/vehicle/resource/start`.
- **Example:** `{op: preset, file: presets_all.inc, name: standard_all, set: {unitLimits: "flamer=2;-sniper_only"}}`.
- **Writes:** the preset file.
  - `unitLimits`, `chargeFactors` and `commandPoints` merge their entries: `tag=N` sets or adds (new entries go before `*=`), `-tag` removes, a leading `=` replaces the whole list.
  - Other keys have their value replaced.
  - A key the preset lacks is added under its parent when the preset reader takes it there (info `GEN_PRESET_KEY_ADDED`), in the game's case (`growtime` -> `{growTime ..}`, MIS-11); `chargeFactors` / `unitset` get `{value ".."}`. The parent must exist.
- **Refuses:**
  - `GEN_PRESET_FILE_UNKNOWN`
  - `GEN_PRESET_NAME_UNKNOWN`
  - `GEN_PRESET_KEY_MISSING`: neither the key nor its parent is in the preset.
  - `GEN_PRESET_KEY_UNKNOWN`: a name the reader skips without a word (MIS-01); the message lists the names it takes there.
  - `GEN_PRESET_VALUE`: also a limitmin/limitmax/period/speed the budget mode refuses (MIS-17).
- **Warns:** `WARN_GEN_PRESET_TAG_UNUSED`, when no card carries the tag [I].
- **Tag:** [V] data form. [T] the limit applies in a match.

### army: a new side (AS2)
- **Fields:**
  - `tag`
  - `like`
  - `id`: 6..99. Default: the lowest free id.
  - `title`
  - `icon_like`
  - `alliance`
- **Example:** `{op: army, tag: fin, like: rus, title: Finland, icon_like: rus, alliance: axis}`.
- **Writes:**
  - `armies/<tag>.set`: a copy of the like's file with the id, title and icon replaced. `appid_base` is dropped.
  - `flag_<tag>.tga`
  - an empty `units/vehicles_<tag>.set`, and its include line after the last `vehicles_*` include in `vehicles.set`
  - `{armies "<tag>"}` in the alliance block of `preset_alliances.inc`
  - the text `mp/army/<tag>`
- **Refuses:**
  - `GEN_ARMY_EXISTS`
  - `GEN_ARMY_LIKE_MISSING`
  - `GEN_ARMY_ID_RANGE`
  - `GEN_ARMY_ID_USED`
  - `GEN_ARMY_ALLIANCE_UNKNOWN`
  - `GEN_ARMY_ICON_MISSING`
  - `GEN_ARMY_AS2_ONLY`
- **Bots:** at the end of the run (the wreck step), each new army that the same spec gave cards (roster with `army: <tag>`) gets a `["<tag>"] = {..},` block right after every `Units = {` line of `bot.data.lua` (bot.lua reads `units[<army>]`, MIS-77). Its rows copy the stage's row of each card's like unit with the unit name changed (info `GEN_ARMY_BOTS`). A card whose like has no row: `WARN_GEN_ARMY_BOTS_PART`. A block already there: `GEN_ARMY_BOTS_THERE`, left as is. No cards: info `GEN_ARMY_NO_BOTS`, nothing written (the bots of that army buy nothing). The last row of the block has no comma, as vanilla writes the last row of each list (`{priority = 1.0, class = UnitClass.Tank, unit = "ha-go"}` then `},`); the bots page buy-first (botrecipe) accepts that last row as its anchor and moves the comma when it adds a row after it (GEN-FIX4). [V] data form; [T] the bots buy.
- **Tag:** [V] read (TST-95, MIS-07). [T] lobby, flag and rank.

### kit: soldier inventory
- **Fields:**
  - `breed`: `rus/rifle`, or a name with `army`.
  - `add`: a list of `{item, count | filled, in_hands}` entries.
  - `del`: a list of item names.
- **Example:** `{op: kit, breed: rus/rifle, add: [{item: ppsh41, filled: true, in_hands: true}], del: [mosin]}`.
- **Writes:** the breed file. Removed `{item ..}` lines are dropped and new ones are inserted before `{in_hands}`. The `in_hands` index is recomputed so it stays on the same item.
  - An item the breed already holds once, with `count` (or `filled`): that line's value is set in place, e.g. `{op: kit, breed: rus/rifle, add: [{item: "grenade f1", count: 3}]}` -> `{item "grenade f1" 3}`. The same value: info `GEN_KIT_COUNT_SAME`.
- **Refuses:**
  - `GEN_KIT_ITEM_UNKNOWN`: no `set/stuff` file name has those tags.
  - `GEN_KIT_ITEM_EXISTS`: the item is there and no count was given, or it is there on several lines.
  - `GEN_KIT_ITEM_ABSENT`
  - `GEN_KIT_HANDS_GONE`
  - `GEN_KIT_BREED_UNKNOWN`
  - `GEN_KIT_ARGS`
- **Tag:** [V] data form. [T] the weapon in hands fires.

### Extensions of existing ops
- **card `list:`** `{op: card, unit: t34_0, army: rus, list: cooperative, fields: {cost: 200}}`.
  - **Writes:** `units/<list>.set`, which is the `common.set` include list plus an override card. TST-94: the engine reads only the first of `<gameType>.set`, `<gameClass>.set` and `common.set`.
  - **Tag:** [T]. Vanilla has no such file.
  - **Refuses:** `GEN_CARD_LIST_ARGS`, `GEN_CARD_UNKNOWN`.
  - **Warns:** `WARN_GEN_CARD_LIST_NO_MODE`.
- **breed `del:`** `[item ..]` or `{items: [..], perks: [..]}`. Unknown names are refused (`GEN_KIT_ITEM_ABSENT`, `GEN_BREED_DEL_ABSENT`).
- **breed `decl:`** now works when soldiers.set declares the soldier through a macro call such as `{"mp/rus/rifle" ("rifle" side(rus))}`. The declaration is written as an expanded block with the fields set (info `GEN_BREED_DECL_EXPANDED`). A field that cannot be set refuses the whole op (`GEN_FIELD_UNKNOWN`). [V] data form; [T] the cp/score values in game.
- **squad:**
  - **New fields:**
    - `content`: raw `{content ".."}` text.
    - more than 4 member types
    - `not_for_sale: true`
  - **Writes:** these fields write an expanded card block from the like's macro line.
  - **`order`:** `first`, `last` or `<squad>`.
  - **`remove: true`:** writes `{"<name>(<army>)" {remove}}`.
  - **Tag:** [T], for all of these in game.
  - **Refuses:** `GEN_SQUAD_ORDER_UNKNOWN`, `GEN_SQUAD_REMOVE_UNKNOWN`, `GEN_SQUAD_CONTENT_BAD`.
- **bots `{priority, class, min_income, min_team}`** (squad, roster): the copied bot.data.lua Purchases entry gets these values. Refuses `GEN_BOTS_CLASS_UNKNOWN` and `GEN_BOTS_VALUE` before any write. [T] the bots buy the unit.
- **roster of a new army (AS2):** `like` may be a card of another army (a new army's list is empty). The card is copied into `units/vehicles_<army>.set` with its side tag set to `s(<army>)` (info `GEN_ROSTER_OTHER_ARMY`). No such list: `GEN_ROSTER_NO_FILE` (make the army first). [V] data form; [T] buyable as the new army.
- **weapon:** a weapon outside `gun/` (mgun flame reactive bombing rifle smg pistol bazooka) is mounted too (info `GEN_WEAPON_OUTSIDE_GUN`; ammo lines are not changed [T]). Several matches: `GEN_WEAPON_AMBIGUOUS`. A breed or a soldier model with no `{place}`: `GEN_WEAPON_USE_KIT`, which names the kit op.
- **set `op`:** `add` changes the line in place when the key is there once without a name (`GEN_SET_ADD_SET`), or adds a line after the others when the key repeats or its lines carry a name (`GEN_SET_ADD_APPENDED`). `append` always adds a line; on a single unnamed key it is refused (`GEN_SET_APPEND_SINGLE`). A key built by a macro call such as `("speed" s(800))` is refused with `GEN_SET_KEY_MACRO` (use the macro op). Same rules in `patch-entity --add/--append` (`PATCH_*`).
- **clone in `--plan`:** the planned files of clone-entity (`--dry-run --plan-out`) stay in memory, so later set, macro and armor rows (by name or `file:` path) edit them, and `GEN_PLAN_WRITE` lines show their final content.
- **wrecks:** the `_x` / `_xx` wreck clones run once at the end, in gen main and in `finishText`. So the task path (gui ext task, which calls `finishText`) gets them by default. There is no `wreck` op; `wreck: false` on the clone step skips it.
- **card on an existing card** `{op: card, unit: <vehicle> | mp/<army>/<soldier>, army, price, cp, score, icon, info, fields: {..}, tags: [word, -word], not_for_sale | basic | remove: true|false}`.
  - Vehicle cards are found in the army lists, soldier cards (`{"mp/rus/rifle" ("rifle" side(rus))}`) in `soldiers.set` (unit `rifle` or `mp/rus/rifle`). Same-name cards merge in the engine, so the card itself is edited.
  - `price` = `{cost}`; `cp`, `score` (or `sc(..)`) and the other keys are set where the card or its call has them. A value that only the macro holds expands the call into a full block (info `GEN_CARD_EXPANDED`); a missing card key is added as a line.
  - `tags`: `word` adds, `-word` removes, in `{tags ".."}` or `t(..)`. The side tag comes from the macro: `-rus` is refused (`GEN_CARD_TAG_ABSENT`).
  - Flags: true adds `{not_for_sale}` / `{basic}` / `{remove}` (already there or from the macro: info `GEN_CARD_FLAG_SET`), false takes it off (absent: `WARN_GEN_CARD_FLAG_ABSENT`). `basic` survives a `{remove}` of the mode list; `remove` deletes the entry.
  - `info` on a vehicle writes the text `info/entity/<unit>` (`info_key` to change it); on a soldier it is refused (`GEN_CARD_INFO_SOLDIER`: the panel shows the squad text).
  - **Refuses:** `GEN_CARD_UNKNOWN`, `GEN_CARD_TAGS_BAD`, `GEN_CARD_FLAG_BAD`, `GEN_CARD_NO_TAGS`, `GEN_CARD_TAG_ABSENT`, `GEN_FIELD_UNKNOWN`. Info `GEN_CARD_EDIT` lists the change. [V] data form; [T] the panel.
- **roster `tags` / `not_for_sale` / `basic` / `remove`:** the same tag and flag edits on the new card.
- **squad `change: true`** `{op: squad, name, army, change: true, members: ["breed:n" ..] | ["-breed" ..], content, fields: {cost: 130}, not_for_sale, order}` edits an existing squad.
  - `members` is the whole new list, or only `-breed` entries to take types out (not both). A macro line stays a line with `c1..cN` rewritten and the macro set to `squad_with<N>types` (it must be defined); `content`, `not_for_sale: true` or more than 4 types expand it into a card block.
  - **Refuses:** `GEN_SQUAD_CHANGE_UNKNOWN`, `GEN_SQUAD_MEMBER_ABSENT`, `GEN_SQUAD_BREED_UNKNOWN`, `GEN_SQUAD_MACRO_UNDEFINED`, `GEN_SQUAD_ARGS` (mixed members, empty result, content with members, nothing to change). [V] data form; [T] in game.
- **text of a key a game `#` file defines** (`mp/army/rus` in `#dlg_mp.lng`): written into a mod copy of that file (info `GEN_TEXT_VANILLA_FILE`), since a second definition in the mod's own `#<slug>.lng` may lose (LOC-19). `--plan` names the file. [I] the `#` file order.
- **mission-clone / map-clone in `--plan`:** the tool runs into a temp folder; its text files (mode card `games/<mode>.set`, `.mi`, `map.info`, `.lng`) go into the plan overlay, other files are names only, so later `set` rows of the same spec edit them. A real run writes the mod folder and later rows read it from disk.
- **mission-clone `no_bots: true`** (with `with_mode`): the new mode card keeps bots off (`mission-clone --no-bots`). Use it when the source mission has no flag_point, which otherwise fails lint with `MIS_BOT_NO_FLAGS` (MIS-65). Without `with_mode` it is `GEN_MISSION_ARGS`.

- **set paths with a quoted block name** holding `/` (`units/"mp/rus/rifle"/cp`): the quoted name is one segment (also `patch-entity`).

Tests: `node tools/gen/test/ops-unit.js`, `fix2.js`, `fix3.js` (own fixtures, part of `test/run.sh`).

## Asset ops (lib/ops-asset.js)

On GoH gun, shell, item, soundclass and weapon run on the same file forms (gun writes the GoH macros `("reload time" seconds(n))`, `("velocity" mps(n))` or `("velocity m/s" ap() apcr() he() heat())`, `("fire rate" rpm(n))` when the folder's .presets define them [I]; an `accuracy_*` call carries the define's params, `("accuracy_direct" r1() range_ap() range_he() range_heat())`, copied from the like's own call with range_* set to a new `range` (a param the like does not give: `GEN_GUN_GOH_ARGS`); weapon keeps the vehicle's ammo line; mission-clone runs the tool's `--exe goh` branch [I]); gun pen/pen_scale/damage, sound, voice, skin, mapinfo, army, card list, squad remove and `--describe` stop on GoH with `GEN_<OP>_AS2_ONLY` and one plain line naming why and the row; kitbash and stuffmodel are AS2 and AS64 only (model editing). In `--plan`, text files show their changed lines as `GEN_PLAN_WRITE`; binary files (.wav, .dds, .ply) are listed by key in the facts line `<op>: writes N file(s)` (`--json` lists every key). Staged files (`files`, `sounds`, `textures`) are read from the spec's folder and never changed. Shared refusals: `GEN_<OP>_ARGS`, `GEN_<OP>_LIKE_MISSING`, `GEN_<OP>_LIKE_AMBIGUOUS`, `GEN_<OP>_EXISTS`, `GEN_<OP>_VALUE` (a number out of range or a name that is not a preset; the message gives the range or the names).

### gun: a weapon of any class
- **Fields:**
  - `name`, `like`: as the cannon op. `class`: rifle mg smg pistol launcher cannon mounted. It picks the stuff folders the like is found in (rifle/, mgun/, smg/, pistol/, bazooka/ + reactive/, gun/, gun/ + mgun/ + flame/ + reactive/ + bombing/).
  - `rof` (rounds per minute): `("recoveryTime" r(rpm))` when the folder's .presets has the macro, else `{recoveryTime 60/rpm}`.
  - `burst`: `short` / `medium` / `long` (the folder's `burst_*` preset), or two numbers `"short long"` (rounds), optionally plus seconds `"short long short_s long_s"` (or `{short, long, short_s, long_s}`), which give `{burst {short n s} {long n s}}`. Seconds not given come from the like's own `{burst}` or `("burst_x")` call (info `GEN_GUN_BURST_TIME_LIKE`). If the like has none, 0.3 / 0.7 is used (`GEN_GUN_BURST_TIME_DEFAULT`).
  - `spread` `{spreading}`, `aim` `{RelaxationTime}` (seconds), `reload` `{rechargeTime}` (the cannon op's `recharge` is the same key; give one), `health` `{healthDamage}`.
  - `magazine`: `{filling "<the like's ammo>" n}`.
  - `fire_sound`, `reload_sound`: a path under `sound/weapon/shot/` or `sound/weapon/reload/`, checked to exist (or made by a sound op earlier).
  - `params`: raw preset calls. `{recoveryTime: "r(1200)"}` gives `("recoveryTime" r(1200))`. A map value gives a `{parameters "<shell type>" ..}` block.
  - Outside gun/ also: `speed`, `damage`, `range` (`"effective max"` or a `range_*` preset), `accuracy` / `caliber` presets.
- **Example:** `{op: gun, name: my_mg42, like: mg42, class: mg, rof: 1500, burst: long, magazine: 150}`. `gen --sample gun-class`.
- **Writes:** `set/stuff/<like's folder>/<name><like's extension>` = `{from "<like>"` plus one line per field. With no class (or cannon) and none of the new fields, it is exactly the cannon op (old specs and gold unchanged). A cannon with the new fields: the cannon op's file plus the new lines.
- **Refuses:** `GEN_GUN_CLASS` (unknown class, a like of another class, or pen on a non-cannon), `GEN_GUN_PARAM_UNKNOWN` (not a macro of the folder), `GEN_GUN_SOUND_MISSING`.
- **Tag:** [V] data form and macros (vanilla mgun/smg files). [I] a macro may also come from a parent folder's .presets. [T] rate, burst, spread and reload in game.

### shell: a new shell type
- **Fields:** `id` (`family.type`, e.g. `bullet76x.heat`), `like`, `preset` (ap apcr fg fg_medium fg_heavy) + `args` (its number), `blast` (layers `"energy inner outer"` or `{energy, area}`), `mass`, `cumulative`, `entity`, `tags`.
- **Example:** `{op: shell, id: bullet76.he2, like: bullet76.fg, blast: ["4 0.5 6", "1 6 12"]}`. `gen --sample shell`.
- **Writes:** a full copy of the like as `shell/<id>.ammo`, edited. `blast` writes `{damage blastwave ..}` then `{damage add blastwave ..}` (the extra layers that `set` cannot write, KEY-17). It removes the like's own blast layers and its fg* preset call (info `GEN_SHELL_PRESET_DROPPED`, since the preset writes layers too).
- **Tag words and damage (shell and item):**
  - `tags: ["-word", ..]` drops a word from the copy's own `{tag}` lines; a line left empty is cut.
  - `damage_edit: [{type, layer, set: {key: value}}]` sets values inside the copy's own n-th `{damage [add] <type>}` block. No layer is added.
- **Refuses:** `GEN_SHELL_ENTITY_MISSING`. `GEN_SHELL_TAG_INHERITED` / `GEN_ITEM_TAG_INHERITED`: the word is only on a parent [I]. `GEN_*_TAG_ABSENT`: the word is on no file. `GEN_*_DAMAGE_INHERITED`: the layer is inherited. A `{damage x}` in the copy replaces that inherited effect rather than changing it (KEY-17), so use `blast`.
- **Tag:** [V] data form. [I] the extra `{tag}` words add to the inherited ones. [T] penetration and blast in game.

### item: a grenade, mine or other item
- **Fields:** `id`, `like`, `throw {range, angle, spread, speed}`, `fuse` (`{special {PrepareTime}}`), `mass`, `weight`, `size "w h"`, `blast`, `cumulative`, `entity`, `tags`.
- **Example:** `{op: item, id: my_f1, like: f1, fuse: 5.5, throw: {range: 22}}`. `gen --sample item`.
- **Writes:** a copy beside the like, same extension. A `{throw}`, `{special}` or `{inventory}` block the like only inherits is copied in first, then edited.
- **Refuses:** `GEN_ITEM_NO_THROW` (the like is not thrown), `GEN_ITEM_NO_FUSE`, `GEN_ITEM_ENTITY_MISSING`.
- **Tag:** [V] data form. [I] `speed` = `{constantSpeed}`. [T] range, fuse and blast in game.

### sound: a new sound folder
- **Fields:** `id` (folder under `resource/sound/`), `like` (a folder whose settings, and wavs when no `files`, are copied), `files` (.wav files or folders), `loudness` (a sound.set row), `signal "name radius"`, `volume` 0..1, `tag` (effects emotions speech environment), `format` (pcm or ima, the conversion target).
- **Example:** `{op: sound, id: weapon/shot/my_mg, like: weapon/shot/mgun/mg42_burst, files: [my_shots/]}`. `gen --sample sound`.
- **Writes:** the wavs and a CRLF `folder.set` with the like's effective settings overridden by the spec. A wav the game plays (PCM 8/16-bit, IMA ADPCM) is copied byte for byte. Others (24-bit, float ..) are decoded and written as 16-bit PCM or IMA ADPCM by `tools/lib/wav.js` (info `GEN_SOUND_CONVERTED`).
- **Mono:** `mono: true` mixes a stereo wav down to one channel (mean of the channels, rate kept, `wav.toMono`), then the file is written as 16-bit PCM or IMA ADPCM. Plan line: info `GEN_SOUND_MONO` ("2 channels -> 1"). Needs `files`.
- **Refuses:** `GEN_SOUND_FILE_MISSING`, `GEN_SOUND_BAD_WAV`, `GEN_SOUND_LOUDNESS_UNKNOWN`, `GEN_SOUND_VALUE` (mono not true/false), `GEN_SOUND_ARGS` (mono without files). **Warns:** `WARN_GEN_SOUND_RATE` (not 44100 or 22050), `WARN_GEN_SOUND_STEREO` (not given when mono downmixed it).
- **Not done (shape unproven):** `min_distance` / `max_distance` ({MinDistance m}{MaxDistance m} in folder.set). The engine reads those keys there (tools/sound/model.js), but none of the 78 vanilla AS2 folder.set files holds them, so the line form is not shown by vanilla. Distances come from the `loudness` row (soundclass op).
- **Tag:** [V] folder.set form and the formats wav.js marks game-safe. [T] a converted or downmixed file plays in game.

### soundclass: a loudness row
- **Fields:** `name`, `min`, `max` (m), `priority`; `percent` (`{<group>: share | "share max"}`). Give a loudness row (name, min, max), `percent`, or both.
- **Example:** `{op: soundclass, name: shoot far, min: 60, max: 400}`, `{op: soundclass, percent: {speech: "12 1", effects: 43}}`. `gen --sample soundclass`.
- **Writes:** `resource/sound/sound.set` with one `{loudness "name" min max [priority]}` row more. The mod copy replaces the whole vanilla file, so it starts from the effective file and keeps every row, `default` included (VIS-27; info `GEN_SOUNDCLASS_FULL_COPY`).
- **Percent:** each entry sets the row `{percent "<group>" share [max]}`: share 0..100 of the voices, max (optional, whole number) how many play at once. Groups: effects emotions speech environment main_environment. An existing row is replaced; a new one goes after the last percent row. Vanilla form: AS2 `resource/sound/sound.set` (`{percent "effects" 45}`, `{percent "emotions" 15 2}`, `{percent "speech" 10 1}`, `{percent "environment" 20}`, `{percent "main_environment" 10}`) and GoH `resource/sound/sound.set` (same five rows, 70 / "20" / "2 1" / "6 4" / "2 2"); both sum to 100. Info `GEN_SOUNDCLASS_PERCENT`; warns `WARN_GEN_SOUNDCLASS_PERCENT_SUM` when the shares no longer sum to 100.
- **Refuses:** `GEN_SOUNDCLASS_EXISTS`, `GEN_SOUNDCLASS_NO_DEFAULT`, `GEN_SOUNDCLASS_ARGS` (no row and no percent, percent not a map), `GEN_SOUNDCLASS_VALUE` (unknown group, share outside 0..100, max not whole).
- **Tag:** [V] data form (both rows). [I] what the engine does with a sum other than 100. [T] the hearing range and the group shares in game.

### voice: a new talk language
- **Fields:** `id`, `like` (rus ger ger2 eng usa jap), `speakers` (v1..vN, default the like's count), `sounds` (`{"[human|vehicle|cannon/]<folder>[/v<N>]": file | [files] | folder}`), `format`.
- **Example:** `{op: voice, id: aus, like: eng, speakers: 2, sounds: {attack: my_attack/}}`. `gen --sample voice`.
- **Writes:** `talk.set` (whole file, info `GEN_VOICE_FULL_COPY`) with one `("phrase_voice" args %0 <id> N %1)` line per speaker in `(define "phrases" ..)`. Also the like's `sound/{human,vehicle,cannon}/talk/<like>/` trees under `<id>/`: speaker N plays the like's speaker ((N-1) mod count)+1, and `sounds` replaces the wavs of a folder (same wav pipeline as sound).
- **Rate:** a file at a rate other than 44100 or 22050 Hz (for example 48 kHz) is decoded and resampled (linear) to 44100 Hz, or to 22050 when it is at most 22050 Hz. It is then written as 16-bit PCM or IMA ADPCM, with info `GEN_VOICE_RESAMPLED` (the plan line). The sound op still only warns (`WARN_GEN_SOUND_RATE`).
- **Mono:** `mono: true` downmixes the stereo wavs given in `sounds`, as on the sound op (info `GEN_VOICE_MONO`).
- **Loudness:** `loudness: "<class>"` (every talk tree the voice gets) or `{human|vehicle|cannon: "<class>"}` writes `resource/sound/<tree>/talk/<id>/folder.set` as `{sound {tag <group>} {loudness "<class>"}}` (CRLF), the group taken from the parent. Vanilla form: AS2 `resource/sound/human/talk/folder.set` (`{sound {tag emotions} {loudness "talk"}}`), `vehicle/talk/folder.set` (`{loudness "talk2"}`), `human/talk/eng/death_cry/folder.set` (`{sound {tag effects} {loudness "talk"}}`). Sub folders with their own folder.set (death_cry) keep their loudness. Info `GEN_VOICE_LOUDNESS`.
- **Not done (shape unproven):** phrase text (`texts: {<phrase>: ".."}` as talk/<key> .lng rows). Vanilla talk.set phrases carry only `{text_dbg ..}`, and the talk/ keys in `#dlg_ingame.lng` are message formats (ally, enemy), not phrase texts, so vanilla shows no phrase-text row to copy.
- **Refuses:** `GEN_VOICE_FOLDER_UNKNOWN`, `GEN_VOICE_NO_PHRASES`, `GEN_VOICE_FILE_MISSING`, `GEN_VOICE_BAD_WAV`, `GEN_VOICE_VALUE` (mono not true/false, loudness for a tree the voice does not get), `GEN_VOICE_LOUDNESS_UNKNOWN` (class not in sound.set).
- **Tag:** [V] talk.set and folder.set form. [I] a breed picks it with `{voice "<id>"}`; the voice folder's loudness reaches its phrase folders. [T] the phrases play in game, and how far they carry.

### skin: a soldier skin or a vehicle texture variant
- **Fields:** `id`, and `like` (a humanskin folder) or `entity` (a unit), `textures` (`{diffuse|bump|specular|<texture name>[#variant]: file.dds}`), `texmod` (with entity).
- **Example:** `{op: skin, id: ger_com2, like: ger_com, textures: {diffuse: my_coat.dds}}`, or `{op: skin, id: winter, entity: t34_76, textures: {t34: t34_white.dds}}`. `gen --sample skin`.
- **Writes:** humanskin: the folder copied as `humanskin/<id>/`. `<like>.def/.mdl` and the textures named after the like are renamed, the def's Extension and the mtl names follow, and the given .dds files replace textures. Vehicle: `<texture>#<id>.dds` beside the model. `texmod: true` also sets `{texmod "<id>"}` in the def (whole-file copy, `GEN_SKIN_FULL_COPY`); otherwise a mission `{TexMod}` or map.info `texMod` picks it.
- **Refuses:** `GEN_SKIN_NOT_DDS`, `GEN_SKIN_FILE_MISSING`, `GEN_SKIN_STEM_UNKNOWN`, `GEN_SKIN_ENTITY_UNKNOWN`, `GEN_SKIN_AMBIGUOUS`, `GEN_SKIN_NO_MTL`. **Warns:** `WARN_GEN_SKIN_SIZE`.
- **Tag:** [V] file layout (vanilla ger_com, census `#variant` files). [T] the texture shows in game.

### stuffmodel: an inventory model
- **Fields:** `id`, `like` (folder under `entity/inventory/<group>/`), `item` (the weapon or item that shows it), `camera {origin, lookat, fov}`.
- **Example:** `{op: stuffmodel, id: my_mg42_inv, like: mg42, item: my_mg42}`. `gen --sample stuffmodel`.
- **Writes:** the folder copied as `<group>/<id>/`, def and mdl renamed, the def's Extension and `{extender "stuff" {item}}` set. `item` also gets `{entity "<id>"}` (a whole-file copy of a vanilla stuff file: `GEN_STUFFMODEL_FULL_COPY`). `camera` edits the `{Extender "preview" {"Stuff" {camera}}}` block of the mdl.
- **Refuses:** `GEN_STUFFMODEL_ITEM_MISSING`, `GEN_STUFFMODEL_NO_CAMERA`.
- **Tag:** [V] file layout. [I] the preview camera block. [T] the inventory picture and the dropped model in game.

### mapinfo: map.info values
- **Fields:** `map` (`multi/<m>`), `mode` (edit `<mode>.info`), `set {maxPlayers, minPlayers, texMod, ranked, rankedMinPlayers, rankedMaxPlayers, parameters}`. Another key is written as is, with `WARN_GEN_MAPINFO_KEY_UNCHECKED`.
- **Example:** `{op: mapinfo, map: multi/1v1_road, set: {maxPlayers: 4, texMod: 1}}`. `gen --sample mapinfo`.
- **Writes:** the map's `map.info`, edited through patch-entity (whole-file copy: `GEN_MAPINFO_FULL_COPY`). On a map made by an earlier map-clone it is skipped in `--plan` (`GEN_PLAN_SKIPPED`).
- **Refuses:** `GEN_MAPINFO_MISSING`, `GEN_MAPINFO_NO_GAME`; min above max is `GEN_MAPINFO_VALUE`.
- **Tag:** [V] keys from the map.info census. [T] the lobby slot count in game.

Tests: `node tools/gen/test/ops-asset.js` (its own fixture, part of `test/run.sh`). The GEN-FIX2 changes (roster of a new army, weapon outside gun/, set add/append, plan clone, tags/damage_edit, no_bots, voice rate, burst seconds, task-path wrecks) are in `test/fix2.js` (own fixture). Army price on every stock army is in `test/armyprice.js` (real game, SKIP without it).
