# mow-games: what a mod root mounts, load order, layers
When: "my file is ignored", "does the pak load", "which copy wins", "why does GoH skip my folder".

## Steps
1. `mow_file_which {game: "as64", path: "resource/set/stuff/gun.def", mods: ["a", "b"]}` (the copy the game reads).
2. `mow_mods_clash {game: "as64", mods: ["a", "b"]}` (what two mods both change, who wins).
CLI: `node tools/vfs/vfs.js <gameDir> --exe <game> --mods a,b which <path>` · `node tools/conflicts/conflicts.js --game <dir> --mods a,b --exe <game>`.
GUI: Tools & Settings > Expert Tools > Conflicts; Test, Share & Play > Share > Mods together.

## Facts
| | AS64 | MoW:AS2 | GoH |
|---|---|---|---|
| a mod root mounts | `resource/`, `resource.pak`, `N.pat`, `localization/`, `localization.pak` | the same | only `resource/`, `N.pat`, `localizations/` |
| extra layers | `as64/core` after the game, before mods, every mode; `as64/plus` = built-in mod `as64+` in Enhanced | none | none |
| subscribed Workshop item | loaded in place; the `mods/` copy is ignored | - | - |
| names | as written | as written | normalised at read |
| pak | zip | zip | zip with real checksums |
| never replace | - | - | `/set/registry.reg`, `dlc.reg` (game stops) |
Rows: VFS-26 VFS-46 VFS-47 [V], LOG-17, GHVFS-04 GHVFS-09 GHVFS-14 GHVFS-18, VFS-39, PORT-34.

## Same in all
A later mod overrides an earlier one, whole file, no merge. VFS-01 VFS-15 [V]

## What goes wrong
- a tool run without exe = as64 does not see `as64/core` and `as64+`, and reports the wrong winner.
- `localization/` (AS2 name) in a GoH mod, or the reverse: not mounted.
- extra folders in the mod root (docs, sources): ignored by the game; fine.
- a pak made by a tool that writes zero checksums: GoH floods the log and reads slowly.

## Check
`mow_file_which` names the mod you expect; in game the value from that copy shows.
