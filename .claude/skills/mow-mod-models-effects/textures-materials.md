# mow-mod-models-effects: textures and materials (.dds, .mtl)

when: "pink / checkered texture", "texture does not change", "which texture does this use", "DXT10 not supported", "shiny / flat material", "normal map looks wrong".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.
Choosing a uniform or camo for a unit → skill `mow-mod-units` (`skins-textures.md`).

## Steps
1. read one texture: MCP `mow_texture_info {file:"<disk path>"}` or `{key:"texture/..", mod:"<mod>"}` → format, size, mips, which copy wins, what would refuse to load
2. what a model uses: MCP `mow_model_info {model:"<name>", mod:"<mod>", show:["meshes"]}` (mesh → .mtl → textures)
3. textures a mod names but nobody holds: MCP `mow_asset_missing {mod:"<mod>"}` (as64 / mowas2)
4. binary headers of a whole mod: `node tools/binhdr/binhdr.js <gameDir> --mods <mod> --ext dds,tga [-q] [--summary]` (TEX_EXT_SHADOW = a stray file shadows the .dds)
5. convert a picture format (ported art): `node tools/artport/artport.js formats` and `convert` (`--convert png`)
6. GUI: Models & Sim tab > `models` page, Meshes and materials; `art` page for camo and variants

## Facts
- `.mtl` is text: `{material <type> {diffuse "name"} {bump "name"} {specular "name"} ..}`; names are looked up without extension along the texture paths
- for one name the LAST of `.dds .tga .bmp .jpg .png` found wins, and `.ebm` / `.tex` beat all (FMT-04)
- accepted `.dds`: DXT1-5 and plain RGB(A); up to 15 mips; 2D and cube up to 8192 (FMT-02)
- `.ebm` / `.tex` are text files that describe animated or composed textures (FMT-17)
- texture variants (camo) are picked by name suffix rules

## Per game
- as64 / mowas2: as above. as64 warns on GoH's two-channel normal maps
- goh: also loads `ATI2` / BC5 normal maps (GHFMT-03); an unreadable texture becomes the checker with a warning (GHFMT-05); shader cache differs (GHFMT-39). GoH textures in AS2 need converting (→ skill `mow-mod-port`)

## Silently fails
- FMT-04 a stray `.tga` or `.png` beside the `.dds` silently replaces it
- FMT-02 `DX10` header or a volume texture: `DXT10 textures are not supported.`; GoH `ATI2` in AS2: `Unknown DDS picture format`
- VIS-30 a `.mtl` `{specular "x"}` (or diffuse) naming a texture nobody holds: checker placeholder, no log [I]
- VIS-29 the same for an effect's `{sprite}` [V]
- FMT-30 an OBJ-style `.mtl` that no .ply names is never read [I]
- FMT-03 the `.mtl` itself missing: null material, crash when drawn

## Verify
- `mow_texture_info` says it loads and which file wins; in game the unit shows the texture in light and shade, no checker; log has no `picture format` line (→ skill `mow-mod-test`)
