# mow-mod-models-effects: icon and portrait pictures (the art files)

when: "my unit has no icon", "icon is a grey stub", "make an icon from a picture", "portrait of the soldier", "icons from Gates of Hell", "which size is a unit icon".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Where the buy panel takes the icon from, buttons, panel layout → skill `mow-mod-text-ui`.

## Steps
1. check a mod's pictures: MCP `mow_icon_check {mod:"<mod>"}` → cards, breeds and actions whose picture nobody holds (PICTURE_MISSING)
2. read one picture file: MCP `mow_texture_info {key:"interface/scene/unit_icon/<name>_00", mod:"<mod>"}` (format, size, which copy wins)
3. make the files: copy a vanilla set and repaint, or convert: `node tools/artport/artport.js convert <in.gif|png|tga> <out.tga|png> [--size WxH]`
4. from a GoH unit: `node tools/artport/artport.js find <scene.pak|dir> <substr> [kind]`, then
   `node tools/artport/artport.js port --src <scene.pak|dir> --from <stem> --to <new stem> --out <dir> [--kinds unit_icon,unit_icon_small,squad,portrait,vehicle_view] [--convert gif|png|none] [--size WxH]` (reads GoH, writes only `--out`)
5. GUI: Models & Sim tab > `art` page "Look & Sound": icons (`art/icons`, `art/icon-png`, `art/copy`, `art/check`)

## Facts
- code names a picture without extension: base `/interface/scene/unit_icon/<card name>` → files `<name>_00` .. `_03` (normal, hover, pressed, disabled; `_04` checked)
- buy card picture = `unit_icon/` + the card's name (first token of its entry in `set/multiplayer/units/**`); absent → `unit_icon/stub`
- soldier: breed `portrait` = `/interface/scene/portrait/<name>`, `icon` = `/interface/scene/squad/<name>`
- loader takes `.dds .tga .bmp .jpg .png` (last found wins, `.ebm` / `.tex` first); `.gif` is not loaded: always convert
- text and icon are independent: a unit can have a name and no icon, or the reverse
- sizes are not enforced by the loader: copy the size of the vanilla picture of the same kind (`mow_texture_info` on it)

## Per game
- as64 / mowas2: `.tga` sets as vanilla; `.png` goes as is by artport default [T in game]: `--convert png` writes `.tga` when a png is refused
- goh: other folders and frame sets, `.gif` sources; `mow_icon_check` runs for goh too, artport only ports FROM goh.

## Silently fails
- UI-03 a missing picture is a stub or nothing, never an error
- FMT-04 a stray `.png` beside the `.tga` set wins over it
- a frame set with only `_00`: hover and disabled states show nothing; ship the frames the vanilla set of that kind has
- a card renamed without renaming its picture files: stub icon
- category button picture comes from tag and army rules, not from the card → skill `mow-mod-text-ui`

## Verify
- `mow_icon_check` lists no missing picture; in game open the buy menu: icon in all states, portrait on selection (→ skill `mow-mod-test`)
