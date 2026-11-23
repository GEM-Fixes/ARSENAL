# mow-play-setup: load order, which mod wins
When: "in which order", "two mods together", "this mod needs that mod", "which one overrides".

## Rule
- a later mod overrides an earlier one, whole file, no merging. VFS-15 VFS-01 [V]
- a mod that names another in `Require` needs it in the list; a child mod alone gives "define not found" at boot. VFS-17 PORT-52 [V]
- so: base or library mod first, mods that change it after, small tweaks last.

## Steps
1. What each mod needs: `mow_mod_info {game, mod: "<path>"}` (required mods, version range).
2. Where they fight: `mow_mods_clash {game: "as64", mods: ["mod_a", "mod_b"]}` -> same key or file changed by both, who wins (the last), what is lost.
3. Which copy of one file the game reads: `mow_file_which {game: "as64", path: "resource/set/multiplayer/units/ger.set", mods: ["mod_a", "mod_b"]}`.
4. Set the order: `turn-mods-on.md`.
5. A real fix for two mods that both must change one file is a patch mod: skill `mow-mod-together`.

## CLI
- `node tools/conflicts/conflicts.js --game <dir> --mods a,b --exe as64|mowas2|goh`
- `node tools/vfs/vfs.js <gameDir> --exe <game> --mods a,b which <path>`

## GUI
Test, Share & Play > Share > Mods together (`share/clashes`); Tools & Settings > Expert Tools > Conflicts (Advanced).

## Per game
- AS64: `as64+` goes first in Enhanced mode; `as64/core` loads after the game and before mods in every mode. VFS-46 VFS-47 [V]
- MoW:AS2: same override rule, no extra layers.
- GoH: same "later wins"; names are normalised at read (GHVFS-09). A mod replacing `/set/registry.reg` stops the game (GHVFS-14).

## What goes wrong
- units of mod A vanish with mod B on: B replaced A's whole unit list file. Order cannot merge them; a patch mod can.
- raw text keys on screen with two mods: one mod's text file replaced the game's whole file. LOC-01 LOC-02 [V]
- same mods, other order on a friend's PC: out of sync in multiplayer (skill `mow-play-multiplayer`).

## Check
`mow_file_which` names the mod you expect as the winner for the file that matters; in game the later mod's value shows.
