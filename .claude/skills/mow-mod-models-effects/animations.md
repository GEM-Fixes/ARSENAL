# mow-mod-models-effects: animations (.anm)

when: "the animation does not play", "which animations does this unit have", "add a fire / open-hatch animation", "soldier slides instead of walking", "unknown chunk in animation".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. list: MCP `mow_anim_list {model:"<entity | .mdl path | breed:<key>>", q:"<part of a name>", mod:"<mod>"}` → sequence name, file, frames, bones it moves
2. check the files: MCP `mow_model_check {mod:"<mod>", checks:["export","binary"]}`
   CLI `node tools/binhdr/binhdr.js <gameDir> --mods <mod> --ext anm [-q] [--summary]` · `node tools/expcheck/expcheck.js <mod folder> --game dir`
3. look at one file: `node tools/soedit/soedit.js ops anim info <file.anm>`
4. change one (staged copy, `--dry` first): `node tools/soedit/soedit.js ops anim <operation> <file.anm> [--bone B --from N --to N --at N --count N --name S --out F --dry]`
   operations: reverse fill insert-frame delete-frames duplicate move copy-forward drop-first-frame clone-bone export-bone import-bone rename-bone reset-bone add-bone remove-bone set-visibility new (frames 0-based)
5. GUI: Models & Sim tab > `models` page: Animation editor, Timeline (`anim/info`, `anim/run`)

## Linking
- the `.mdl` lists `{animation {sequence "name" {file "x.anm"} ..}}`; scripts and the engine ask for the sequence NAME, not the file
- vehicles: names the engine and interaction scripts play (fire, recoil, hatch, door, repair states) must exist under those names
- soldiers share one skeleton and one animation set; which clip plays is chosen from tables by stance, weapon and state a new soldier clip is a table edit, not only a file
- a track only moves a bone that exists in the skeleton by the same name

## Per game
- as64 / mowas2: same `.anm`
- goh: adds the interaction event `animation_event "name"` (GHINT-45); ported GoH animations need their bones renamed to the AS2 skeleton (→ skill `mow-mod-port`)

## Silently fails
- FMT-09 a bone name absent from the skeleton: that track is skipped, no error (normal for shared files; suspicious only when ALL tracks miss)
- FMT-08 more than 255 animated bones, version below 0x30000 or zero frames: `Animated bones count is limited to 255!` / `Unsupported animation version`
- FMT-24 a frame index outside the frame count: fatal `Invalid frame #` at load
- FMT-01 a bad chunk: `unknown chunk in animation`
- a sequence the .mdl does not list: the order or script runs with no motion
- WARN_ANM_VERSION_CHANGED after an editor save: the file was rewritten in another version; test it in the game it is for

## Verify
- `mow_anim_list` shows the sequence with its bones matched; in game trigger it (fire the gun, open the hatch, give the order) and watch; log has no animation error (→ skill `mow-mod-test`)
