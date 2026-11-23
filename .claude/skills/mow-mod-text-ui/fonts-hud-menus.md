# mow-mod-text-ui: fonts, cursors, HUD colours, menu background, skins, page scripts

When: "letters show as ?", "change the font", "game stops after my font change", "selection colour", "minimap colours", "cursor", "main menu background / music", "add a menu page".

## Fonts
- every `/interface/font/*.font` is read: `{font_atlas {name "main"} {size 10} {height 17} {style 0} {binary_data "main_10.fnt"}}`; `binary_data` = an AngelCode BMFont binary `.fnt`, glyph pages `<stem>_<page>.tga`
- keyed by (name, size, style); bold is a separate file of the same name; sizes are `uint8`
- `main` size 10 MUST exist: without it, or with no fonts at all, the game stops at start (`No default font [main(10)] found`) (lim UI-16)
- a text picks `<f(name)s(size)>`; no exact size → the biggest size not above the wanted one
- a glyph the font lacks is drawn `?` (lim LOC-14): glyph cover decides whether a translation reads
- a mod replaces a font by the same virtual path, or removes a vanilla stem with a `.patch` `{delete ...}`
- there is no font BUILDER in the kit: make the `.fnt` + pages with a BMFont-format tool [I]

## HUD data, cursors, menus
- `set/interface.set`: selection colours, inventory cell size, aim cursor pictures, structure colours, manual-aim range read-out
- `interface/scene/minimap/minimap.set`: tracer and side colours (`0xAARRGGBB`)
- cursors: `interface/cursor/<name>/` = a frame sequence; named by an action's `cursor` and a weapon's `cursor` / `crosshair` key. A weapon `{cursor "x"}` with no folder: checker cursor, no log (lim UI-21)
- menu backgrounds and music: `interface/pages/interface.set`: `{location "main"|"login"|"single"|"multi"|"multi_ingame"|"options"|"credits" {background {picture ..} {video ..} {media ..}}}`
- skins: `set/registry/default_skin.reg`, `main_menu_skin.reg/.inc` (frame size, colours `"r g b"`, `text_style`)
- page scripts `/interface/pages/script/*.ps`: handlers `on create|destroy|button|key|end`, actions `align button button_arrange dialog dialog_close location location_percent navigation page_back picture scroller size size_percent text`. Button / text / picture pages can be built; the lobby and options pages can not (lim UI-04). A `.ps` named after an existing page adding handlers is [I][T]
- not from data: new dialog types, layout of the buy panel and control bar (lim UI-01, UI-02)

## Steps
1. read the game's file: MCP `mow_file_which` (`path` e.g. `set/interface.set`, `interface/pages/interface.set`, `interface/font/main_10.font`; `mods`)
   CLI `node tools/vfs/vfs.js G --exe as64|mowas_2|mowas2|goh --mods a,b which <path>`
2. copy it into the mod at the same path under `resource/` and edit (whole-file override). one key of a `.set`: MCP `mow_mod_gen` (`mod`, `ops: [{op:"set", rows:[{file, path, value}]}]`, preview first)
   GUI: Editor page, file view Game → "Copy into my mod" (AS2 tabs only)
3. lint: MCP `mow_mod_check` (`mod`, `only: "uilint"`)
   CLI `node tools/uilint/uilint.js <mod> [--game G] [--exe as64|mowas_2|mowas2|goh]`
   codes: FONT_MAIN10_MISSING, FONT_SIZE_RANGE, WARN_FONT_BINARY_MISSING, WARN_FONT_MAIN10_MISSING (UI-16); PICTURE_MISSING (UI-03)
4. signs the font lacks, found before the game shows `?`: `node tools/lnglint/lnglint.js <mod> --game G` (GLYPH, info)
5. textures, video and sound files themselves → skill `mow-mod-models-effects`

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| mandatory font | `main` size 10 | same | `main` size 8 (GHUI-206): ship both sizes when sharing fonts |
| HUD / pages | C++ + `.ps` | same | XML layouts under `interface/layout/`; case-sensitive dialog names; smallest screen 1360x768 (guide 15) |
| menu button pictures | `/interface/pages/main/button/new/` | same | under `/interface/skin/game/` (guide 15) |
| menu video | XVID `.avi`, up to 1280x720 (lim UI-19, UI-20 [I]) | same [I] | ships 1080p: re-encode on a port |
| mod default `settings.set` | never read (lim UI-18) | same | not checked |
All GoH rows: untested, not run in game.

## Silent fails (and one loud)
- LOC-14 / UI-16 a missing glyph is `?`, no log
- UI-03 a missing background or cursor frame: nothing or a stub, no log
- UI-21 a weapon cursor naming no folder: checker cursor
- UI-18 a mod's default settings are ignored
- UI-11 in a `.ps`, `{on key "x"}` with an unknown key name is FATAL (`Invalid key for bind`)
- loud: no `main` 10 → the game does not start

## Verify
- uilint clean; the game starts; main menu shows the background; a text with the mod's special letters reads without `?`; the HUD colour is seen in a match (→ skill `mow-mod-test`)

Depth: · guide 15 (3. Backgrounds, skins and page scripts; 7. Fonts, cursors and HUD files), r09 (font_atlas)
