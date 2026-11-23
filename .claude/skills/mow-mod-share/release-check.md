# mow-mod-share: release check

when: "is my mod ready to release", "check before I upload", before packing.
G = AS2 install, H = GoH install, `<mod>` = mod folder. Nothing here writes into the mod.

## Steps
1. MCP `mow_mod_check {mod:"<mod>", full:true}` (every linter; minutes on a big mod)
2. CLI with the release rules:
   `node tools/doctor/doctor.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--goh dir] --release [--only t,..] [--out dir] [-j N] [-q]`
   `--release` adds: GoH `localizations/` rules, MoW:AS2 modinfo rules, stray files, multiplayer notes (REL_* codes)
3. load verdict per exe the mod claims: `node tools/wouldload/wouldload.js <modDir> --exe as64,mowas2,goh [--game G] [--goh H]`
4. what the mod changes, so the notes can say it: MCP `mow_mod_diff {mod:"<mod>"}` (keys added, changed, removed; whole-file replacements)
5. text coverage: every shown key has a text (skill `mow-mod-text-ui`); `node tools/lnglint/lnglint.js <mod> [--game G] [-q]`
6. the release folder must be clean: only paks (or `resource/`), `mod.info`, optional preview picture. Build it apart from the working folder (`pack.md`)
7. GUI: Share tab > `share` page, check step (`share/gate`, `share/outcheck`)

## Facts
- the mod root mounts only `resource.pak`, `resource/`, `N.pat`, `localization.pak`, `localization/` (lim VFS-26): anything else in the root is dead weight that still ships
- copied GoH assets are kept out by the packer's GoH guard: a release that needs them can not ship them; say so

## Per game
- as64: Enhanced range (MinGameVersion 3.301) or Classic 3.262: say which in the notes; players need the as64 build
- mowas2: classic range 3.262; `--exe mowas_2`
- goh: text under `localizations/`, mod.info range must hold the exe version (PORT-46), Tags expected by the Workshop page; `--exe goh --goh H`

## Silently fails
- ENG-24 a mod.info with an unescaped `"` in Desc stops the game for everyone who subscribes
- VFS-32 the Workshop uploader takes the whole folder: `.git`, notes, backups go public
- LOC-01 a `.lng` named like a game file replaces it whole: vanilla keys vanish for the players
- OVR_FULL_SHADOW (overdiff) an SDL file replaced whole drops game keys a later game update adds
- NET-01 files the lobby compares by size only or not at all: a late hotfix to one player desyncs (`multiplayer-same-files.md`)
- SDL-53 bare LF parses fine; CRLF is the convention: a warning, not an error

## Verify
- check clean or each finding explained; the packed copy started and played once (→ skill `mow-mod-test`); the list of what ships shown to the user before they upload
