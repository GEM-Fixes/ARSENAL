# unitcard: unit card pictures in the vanilla style

Makes every picture a unit shows in the interface (buy card, unit list button, squad picture, portrait, GoH shop card,
damage scheme), each frame, size and format the game reads. The source is an image (PNG, TGA, DDS, JPG, BMP) or a
3D render taken in the GUI (Units page, tool "Unit card"). The look (plate, frames, subject box, silhouette or colour)
is read from the vanilla pictures of the same class and army **at run time**; no vanilla art is stored in this repo.
Writes only into the mod folder named, and only with `--write` (GUI: the Write button, after the confirm box).

Tags: [V] verified (the game read or files measured on the installs), [I] inferred, [T] needs an in-game test.

## Commands

```
node tools/unitcard/unitcard.js kinds  [--game as64|mowas2|goh] [--json]
node tools/unitcard/unitcard.js styles --game G [--kind card] [--group vehicle|gun|infantry|hero] [--army rus] [--out dir] [--json]
node tools/unitcard/unitcard.js plan   --game G --mod M --unit U [--from image | --render] [--json]
node tools/unitcard/unitcard.js make   --game G --mod M --unit U --from image [--preview dir] [--write] [--json]
node tools/unitcard/unitcard.js check  --game G --mod M [--json]
node tools/unitcard/unitcard.js cutouts  [--game G] [--kind k] [--group g] [--army a] [--force] [--root dir] [--mod M --source mod] [--json]
node tools/unitcard/unitcard.js fidelity [--game G] [--kind k] [--group g] [--army a] [--armies 3] [--tests 4] [--cutter builtin|gimp|both] [--max-mean 6] [--json]
node tools/unitcard/unitcard.js sheet  --game G [--kind k] [--class c] [--army a] [--armies 1] [--units 10] [--renders dir] [--out dir] [--plate plain|game] [--json]
```

- `--plate plain|game` (make, plan, sheet): `plain` (default) draws the plate by code from the class numbers (Part 2e); `game` cuts it from the game cards.

- `--game` takes a game id or an install folder (`--dir` too); `--gid` names the game when the folder is not detected.
- unit: `--unit` is a card id (`is2`, `riflemans(rus)`), a breed (`mp/rus/rifle`) or an entity stem; `--kind --army --def --breed --portrait --hero` override what is read; `--kinds card,small` limits the kinds.
- portrait: a portrait shared by other breeds gets a name of its own (`uc_<breed>`) and a `{portrait "..."}` line in the breed file copied into the mod; `--keep-portrait` writes over the shared name, `--new-portrait name` picks the name.
- fit: `--fit contain|cover`, `--crop x,y,w,h`, `--scale 1.2`, `--dx --dy` (pixels at card size), `--anchor 0.5,0.6`, `--mirror`.
- background: `--key auto|none|r,g,b`, `--tol 40`, `--soft 20` (auto keys out the edge colour only when the image has no alpha).
- style: `--look auto|colour|silhouette|keep`, `--tone r,g,b`, `--no-shadow`, `--builtin` (the built-in cutter even when GIMP cutouts exist).
- `styles` prints the class reading (cards, clean share, badges, subject numbers); `--out dir` writes the background plates.
- `make` without `--write` writes nothing (`--preview dir` puts PNG previews in a scratch folder). `--write` runs the repo write guard first.
- `make --render` refuses: the render is taken by the GUI 3D viewer; `plan --render` prints the camera presets.
- exit codes: 0 fine, 1 check errors, 2 bad arguments or refused.

Lib: `lib/img.js` (pure-node pictures: decode, PNG/TGA/DDS write, Lanczos resize, fit, compose, key, outline, shadow),
`lib/kinds.js` (the table below), `lib/unit.js` (vfs + unit resolve), `lib/styles.js` (frame keys and stems),
`lib/layers.js` (the class layers, compose, fidelity), `lib/cutouts.js` (GIMP cutout sets and cache),
`lib/look.js` (clean plates, cutouts, class numbers, compose by the numbers: Part 2d), `lib/plain.js` (plain style: Part 2e), `lib/sheet.js` (acceptance sheets),
`lib/make.js` (plan, compose, write), `lib/camera.js` (render presets), `lib/check.js`, `lib/worker.js` (GUI worker).
GIMP: `tools/gimp/gimp.js` (find, batch run, cutout, layers; MCP group `gimp`).

## Part 1: picture kinds per game

Folder root: `resource/interface/scene/` (`SCENE`). Frames are `<stem>_00 .. _0N`. An `<stem>.ebm` (`{bitmap {frame "x.tga"} ..}`)
wins over the loose frames [V unit spawn button + measured], so when the game has one the mod writes its own `.ebm` too.
A `.png` of the same name wins over the `.tga` (FMT-04) [V]; the tool writes `.tga` and warns when a `.png` shadows it.

### MoW:AS2 and AS64 (same data, `as2` family)

| kind | path | size | frames | named by | missing | tag |
|---|---|---|---|---|---|---|
| card (buy card) | `unit_icon/<card id>_0N.tga` | 104x52 | 4: normal, hover, pressed, locked | the card id in `set/multiplayer/units/*.set` | `unit_icon/stub` | [V] |
| small (unit list, vehicles; match statistics) | `unit_icon_small/<def stem>_0N.tga` | 112x48 | 4 | the entity def stem (`resourceId`); statistics use the card id | `icon_stub` | [V] |
| squad (unit list, soldiers) | `squad/<breed portrait>_0N.tga` | 48x48 | 3 | breed `{portrait}` | empty button [I] | [V] path, [T] missing |
| portrait (selected soldier) | `portrait/<breed portrait>.tga` | 97x135 | 1 | breed `{portrait}` | `portrait/skeleton` | [V] |
| scheme (damage panel) | `<structure root>/<model>/scheme.tga` | 97x140 | 1 | the model name, or `units/<model>/structure` | no scheme drawn [I] | [I] size, [V] path |

- Soldier cards `mp/<army>/<name>` are basic breeds with no cost: no buy card of their own, so card/small apply to vehicle and squad cards only [V data].
- The breed file `resource/set/breed/<id>.set` carries `{portrait "x"}` and `{icon "x"}`; the tool copies it into the mod (it then shadows the game's) and edits only the portrait line, keeping CRLF and cp1251 bytes [V].
- The scheme is drawn with BLEND_MODE_MOD (multiply) over the panel [V]; how a light plate looks in game is [T].

### GoH (`goh` family)

| kind | path | size | frames | named by | tag |
|---|---|---|---|---|---|
| card | `unit_icon/<card>_0N.tga` (often via `<card>.ebm`, also `doctrine_*.ebm` aliases) | 144x72 | 4 | card id in `units/<period>/units_<army>.set` | [I] |
| small | `unit_icon_small/<def>_0N.tga` | 112x48 | 4 | entity def stem | [I] |
| shop (squad card in the shop) | `portrait_squad/<card>_0N.tga\|png` (flat folder) | 112x140 | 4 | card id | [I] |
| squad | `squad/<portrait>_0N.tga` | 48x48 | 3 | breed portrait | [I] |
| portrait | `portrait/<portrait>.tga` | 128x164 | 1 | breed portrait | [I] |

- Not made for GoH, with the reason the GUI shows: `scheme` (GoH draws the damage panel from the model, no scheme picture found in the data) and `vehicle_view` (3D panel, nothing to write) [I].
- GoH sizes come from the files measured on the install; the size actually used is always re-read from the game's own pictures (the most common size wins over this table) [V method].

## Part 2: the layers of a class (read at run time, `lib/layers.js`)

A class = kind x group (vehicle, gun, infantry, hero) x army. Its cards are taken apart into layers; a new card is the same
layers with the user's subject in place of the card's own. Nothing is made up: a class with no card at all is skipped
("no picture of this class"), a class with too few clean cards copies one game card as the template (pick it on the page).

| layer | what it is | how it is read |
|---|---|---|
| background | the plate per frame state (normal, hover, pressed, locked) | per pixel where the cards agree; where every card covers it (the subject place), filled from around |
| army mark | the strip or flag that differs between armies | pixels that agree within an army and differ between armies |
| frame | the border every card shares, alpha kept exactly | alpha edge of the plate (shield, corners) |
| badge | the rank or class badge some cards draw | zones where small groups of cards share a picture; the page lists them with how many cards use each |
| subject | the user's picture in the class style | numbers measured over the cards: height, width, baseline, centre x, look (colour, silhouette tone, light) |

- The subject numbers are shown on the page and can be edited (empty = measured); the look can be forced (colour, silhouette, as it is).
- Frame states 1..N: per class, a per-pixel model of each state from the normal one (tables, overlays); exact where the cards agree.
- Source: the game's cards, or with "match this mod's style" the mod's own cards of the class (game cards when the mod has none).
- Rarer cases handled: `.ebm` aliases with fewer frames, shared portraits (a name of its own), heroes (their own class),
  off sizes (the most common size wins), a `.png` shadowing the `.tga` (warned), card id other than the def, limbers, boats, planes
  (their own group by entity path) [I; [T] in game].

## Part 2b: the GIMP cutouts (`lib/cutouts.js`, `tools/gimp/gimp.js`)

When GIMP 3 is installed, each class is cut with it once and cached; the built-in cutter (pure node, the same layer method)
is the fallback when GIMP is absent, and the page and CLI say which one was used ("GIMP not found, using the built-in cutter.").

- Cache: `%LOCALAPPDATA%\ARSENAL\cutouts\<game>\<kind>\<group>\<army>\` (env `ARSENAL_CUTOUTS` overrides; mods under `mods\<name>-<hash>\`):
  `plate_N.png`, `frame.png`, `army_N.png`, `badgeJ_N.png`, `subject_<card>.png`, `class.xcf` (all layers), `index.json` (hashes).
- A file edited by hand (in GIMP: "Open in GIMP" on the page) is kept on the next build; `--force` (page: Redo) cuts again.
- Run: `gimp-console-3.x -i -n --no-splash -d -f --no-shm --batch-interpreter plug-in-script-fu-eval -b -`, one input sheet in
  and one output sheet out per class (a GIMP file load or save costs about 0.3 s, the cutting itself milliseconds); a start costs about 4.4 s.
- Method per class: up to 12 cards as layers; per card, select where it agrees with 3 others (`gimp-image-select-color`, threshold 14),
  invert, add the class figure and badge zones, add what the class reading marks as subject, grow 1; that is the card's subject cut;
  the rest merged per frame state over the fill is the plate; frame = alpha minus alpha shrunk by 3; army = bbox per frame; badges = rect cuts.
- GIMP 3 procedures used: `gimp-file-load`, `gimp-file-load-layer`, `gimp-file-save`, `gimp-image-new`, `gimp-layer-new`,
  `gimp-layer-new-from-drawable`, `gimp-image-insert-layer`, `gimp-image-remove-layer`, `gimp-image-get-layers`, `gimp-image-get-layer-by-name`,
  `gimp-image-get-item-position`, `gimp-image-select-color`, `gimp-image-select-contiguous-color`, `gimp-image-select-item`,
  `gimp-image-select-rectangle`, `gimp-image-select-polygon`, `gimp-selection-grow|shrink|feather|border|invert|none|save|is-empty|bounds`,
  `gimp-drawable-edit-clear`, `gimp-layer-copy`, `gimp-layer-set-mode` (DIFFERENCE), `gimp-image-merge-down`, `gimp-image-merge-visible-layers`,
  `gimp-layer-flatten`, `gimp-layer-set-offsets`, `gimp-layer-resize-to-image-size`, `gimp-item-set-name|visible`,
  `gimp-context-set-sample-threshold-int|antialias|feather|sample-merged|interpolation|background`, `gimp-image-scale`, `gimp-image-crop`, `gimp-image-delete`.
- Different from GIMP 2 [V on 3.2.6]: `gimp-file-save` and `gimp-file-load` take no drawables argument; `gimp-image-get-layers` returns
  a vector (`vector-ref`, `aref` is unbound); `SELECT-CRITERION-RGB-MAX` is unbound (composite only); the batch interpreter is named
  with `--batch-interpreter plug-in-script-fu-eval`; `gimp-pdb-dump` with a path hung (not used).
- Time on this PC (GIMP 3.2.6): AS64 full set 711 s (49 classes, 47 cut by GIMP, 2 template classes); GoH 803 s (58 classes); cache about 31 MB (AS64) and 62 MB (GoH), plus the fidelity sets under `_fidelity`. Env `ARSENAL_GIMP` names the GIMP folder or exe, `none` turns GIMP off [V measured].

## Part 2c: fidelity (`unitcard.js fidelity`)

Round trip: game cards taken apart and built again from their own subject cut; mean and 99th percentile pixel error (0..255)
per frame state, per cutter. Measured (3 tests per class, 2 armies):

| game | class | built-in mean / p99 | GIMP mean / p99 |
|---|---|---|---|
| AS64 | card infantry usa / eng | 0.5 / 22 , 1.4 / 53 | 0.6 / 24 , 1.6 / 54 |
| AS64 | card vehicle ger / rus | 1.8 / 58 , 1.3 / 38 | 2.1 / 51 , 1.9 / 45 |
| AS64 | small vehicle ger / rus | 2.1 / 51 , 1.9 / 42 | 2.7 / 55 , 2.5 / 48 |
| AS64 | squad infantry eng / usa | 0.3 / 10 , 0.8 / 26 | 0.3 / 10 , 0.9 / 26 |
| AS64 | portrait usa, hero | 0.1 / 4 , 0.6 / 8 | 0.2 / 4 , 0.7 / 7 |
| AS64 | scheme rus / ger | 3.3 / 24 , 2.7 / 24 | 5.9 / 24 , **6.1** / 31 |
| GoH | card infantry, vehicle, gun | 0.9 .. 2.4 / 12 .. 43 | 0.9 .. 2.5 / 10 .. 44 |
| GoH | small vehicle ger, gun fin | **15.9**, **36.8** / 255 | 5.0 / 55 , 1.5 / 16 |
| GoH | shop infantry, vehicle | 1.0 .. 2.4 / 12 .. 36 | 1.0 .. 2.1 / 12 .. 57 |
| GoH | squad usa / eng / hero | **9.9**, 5.8, **21.7** | **9.1**, **9.5**, **27.9** |
| GoH | portrait usa / eng / hero | **45**, **42**, **64** / 255 | **44**, **44**, **27** / 255 |

Open [I]: GoH portraits are full pictures with no shared plate (the round trip cannot hold; a template card is the better path there);
GoH squad frame 0 and heroes keep a high mean (few clean cards); the AS64 scheme on GIMP is just over 6 (light plate, multiply blend).
Not run: AS64 squad hero (1 card) and portrait eng (20% hidden): template cards.
Note: this round trip rebuilds a card from its own cut on its own plate, so it is near zero by construction and says little about a
NEW card. The real test is the acceptance sheet of Part 2d.

## Part 2d: clean plates and compose by the numbers (`lib/look.js`, `unitcard.js sheet`)

`make` uses this path whenever the class has at least 3 game cards and neither `--builtin`, a template card nor the layer preview is
asked; otherwise the older layer reading (Part 2) is used. The GIMP cutout build (CUT_REV 6) takes its plate and subject layers from
here into `class.xcf`; a plate painted over in the `.xcf` (marked hand-made in `index.json`) wins over the read one in `make`.

- Plate: per pixel the most common value over the class's cards (exact for AS2 vehicle cards; 8-level bins, lighter bin first, for
  AS2 infantry and all of GoH, where silhouettes and dark subjects share values). A value few cards show must match the plate
  around it (and change with the frame the way the plate does); thin variant lines are dropped. Pixels no card shows are filled by
  copying texture patches from the plate around them, never blurred. Other frames there = the base plate + the frame's local change.
- Matte: the frame pair (the AS2 card normal/pressed red frame changes the plate a lot and the subject little) gives an exact cover;
  else the distance to the plate, with edge pixels unmixed against the subject next to them. Specks under 6 px are dropped. The frame
  ring, badge zones (unless the kind is a badge) and the outer pixel are never subject. AS2 portrait: only the rank box is cut, the
  box background under the badge is rebuilt from its non-badge pixels. GoH portrait: see-through busts on nothing, the card IS the cutout.
- Numbers per kind + class (`summary(C).measures`): subject box (robust: alpha at least half its 95th percentile, 0.5% cut each side),
  baseline, centre, cover, edge softness, colour statistics, contact shadow (shift, blur, opacity, colour), AS2 infantry silhouette
  colour and opacity (measured [0,0,0] at 0.47 for usa), scheme alpha step.
- Compose: the new subject (RGBA, any size) is scaled by area average to the class box (or the size given), placed by baseline or
  centre, tone-matched (default 0.8 toward the class median brightness, contrast, chroma and channel balance, gains clamped
  0.75..1.33; `styleBy[kind].match` weakens it, 0 = off), given the measured shadow, cut by the frame
  ring and the card's alpha envelope, then each frame made by the measured frame tables. A picture that is empty, has under 30 solid
  pixels or would be blown up more than 1.6x is refused with the reason (`make`: that kind goes to `plan.skip`). A kind with no
  picture at all is skipped with a reason.
- Scheme: the alpha holds damage-zone steps (multiples of 4); a made scheme gets one step (the class's most common) on the drawing [T].
- AS2 portrait badge area is the rank box `[0.66, 0.67, 1, 1]` of the card (was 0.6, 0.62).
- Card layouts (AS2 card and small): one class can hold two layouts. A card with a full-height divider line at a column several
  cards share has a STRIP left of it (`strip<x>`); the rest are `full` [V measured: AS64 infantry 34 strip32 soldier cards + 18 full
  gun crew cards + 5 strip9 (ger2); vehicles 168 full + 15 strip31 supply trucks with the ammo strip]. Each layout is its own class
  (plate, numbers, placement): `classOf(..., { layout })`, `layouts(V, k, group)`; `make` takes the layout of the unit's own card,
  else `o.layoutBy[kind]`, else the most used. A full card of the infantry class is a colour render (gun crews).
- The strip (flag + badge, or the ammo strip) is ONE layer and is never averaged: the army's strip variants (airborne patch, rank
  chevrons, regiment crest, ammo box, shells, tank traps) are listed most used first in `summary(C).strips` and the plate carries
  the first; `compose(..., { strip: stem })` / `make` `o.stripBy[kind]` picks another; `badgeFrom: stem` keeps a unit's own.
  A strip layout of few cards (supply trucks) takes the plate right of the strip from the class's full cards.
- What picture a kind needs: `plan` gives `wants` per kind, `make` gives `styles[kind].look.wants` from the class. AS2 soldier buy
  cards draw the squad's main WEAPON as a flat silhouette in the measured grey and opacity: give any RGBA side picture of the weapon
  (a side render of the weapon model); it is flattened to that silhouette. A soldier picture is wrong there.
- Guns and gun-crew cards (`full` layout): sized by the median size of the side that is not cut, anchored on that side, and the
  trail runs out under the frame (height fit capped at 1.3x the class width).

`sheet`: for about ten units per class with a game card, the clean cutout of the unit is the source of a new card; one PNG per kind +
class (and per layout, file suffix `_strip32` / `_full`; `--layout` picks one) at 3x under `--out` (default env
`UNITCARD_SHEETS`, else `platform.tmpDir('cardlook/sheets')`, which honours `ARSENAL_TMP`). Row 0 = the class plates. Each row:
game | made | difference x3 (premultiplied) | cutout | the other frames game/made | made on another army's plate | made from the render
`<unit>_<kind>.png` in `--renders <dir>/<game>/`. Read it by eye; the mean only helps.

Status 2026-11 (8 units per class, mean diff 0..255):

| game | kind / class | mean | verdict |
|---|---|---|---|
| AS64 | card vehicle ger / gun rus | 8.1 (full) / 10.6 | good: hard to tell apart at 3x; diff only on edges |
| AS64 | small vehicle ger / gun rus | 9.5 / 10.8 | good |
| AS64 | card infantry usa / eng, strip32 (soldiers) | 4.2 / 8.8 | good: clean flag strip on the plate, own strip kept, silhouettes match |
| AS64 | card infantry usa / eng, full (gun crews) | 18.4 / 20.9 | usable: no seam any more; the gun sits a few px off and a little smaller |
| AS64 | card infantry, strip9 (ger2) | 6.5 | usable (not looked at closely) |
| AS64 | card vehicle ger, strip31 (supply) | 0.9 | good: ammo strip variants as a layer, plate from the full cards |
| AS64 | squad infantry eng | 8.7 | good, a few specks at the cut's top left |
| AS64 | portrait infantry eng | 1.7 | usable: badge 1 px off, pale badges faint |
| AS64 | portrait hero | 18 | wrong: painted busts with flags, no shared plate: the cut keeps flag pieces |
| AS64 | scheme vehicle rus | 10.4 | RGB good; alpha zone steps [T] |
| GoH | card infantry / vehicle / gun | 5.6 / 10.7 / 7.4 | usable: dark subject on dark plate, cut has holes where they match (the made card hides them); plate vignette right |
| GoH | small vehicle / gun, shop infantry / vehicle | 6.5 / 7.4 / 6.2 / 6.3 | usable: the cut loses what lies in the badge zone |
| GoH | squad infantry usa / hero | 8.1 / 24.4 | usable / wrong: hero shields are mostly badge zone |
| GoH | portrait infantry / hero | 15.5 / 16.9 | good look (the card is the cut); placement a few px off |

## Part 2e: plain style, the default (`lib/plain.js`)

`make` and `sheet` draw the plate by code by default and copy no game pixel: `o.plate = 'plain'` (default) or `'game'` (the clean
plates and GIMP cutouts above, unchanged), `o.plateBy[kind]` per kind; CLI `--plate plain|game` on `make`, `plan`, `sheet` (other
words exit 2). `plan` prints which plate is used; `styles[kind].plate` says it per kind.

- Numbers (`numbersOf(C)`), measured from the class at run time: shape (rounded rect with inset and corner radius, or the squad
  shield), frame line width and colour per depth and frame state (AS2 card and small: read down from the top edge, so strip and
  full layouts get the same light/grey/dark rounded frame), plate top, middle (median: the pressed red as strong as the game's)
  and bottom colour (gradient) and vignette per frame, a top band if the class has one, for strip layouts the strip's dominant
  colour and its divider line, the
  subject numbers and frame tables. Cached as JSON in `platform.tmpDir('unitcard/plain')` (key: game, kind, class, army, layout,
  install hash; `o.plainCache` dir or false). `o.plainMeasure: false` or no game cards: built-in defaults per game + kind + class
  (`DEF`, army colours `ARMY`).
- `draw(numbers, kind, { badge })` builds a class-shaped object; compose is the same as the game path (Part 2d).
- Strip (AS2 soldier cards, supply trucks): ONE flat army colour (the strip's dominant one, not a badge's) with a slight
  top-to-bottom gradient, a thin lighter divider at its right edge and the generic light chevrons centred in it (the squad
  picture's mark). `o.badgeBy[kind] = 'none'` (`plainOf(..., { badge: 'none' })`) leaves the strip empty.
- Window (`lib/worker.js`): takes `plate`, `plateBy`; `styles` in plain style answers `plate: 'plain'`, `cutter: 'plain'` and
  touches no GIMP or cutout cache; `srcs[kind]` is a data URL or a list of up to 3. With no picture at all only the squad picture
  is made (the badge picked, else chevrons); other kinds still need a source. A squad or portrait with no soldier (breed) picked
  is skipped with "no soldier picked ... pick the soldier of the buy" (both are named after the breed's portrait; GoH squad ids
  carry no breed).
- Squad (both games): a shield with an outline; the picture is an emblem or badge (`o.badgeBy.squad` or `srcs.squad`), not a
  soldier; with none, a generic mark (3 chevrons) is drawn and `styles.squad.generic` is true. `wants` says so.
- Portrait: AS64 a plain backdrop tinted by the army colour with the bust (heroes too); GoH a clear backdrop with a soft fade.
- GoH soldier card: `srcs[kind]` may be an array of up to 3 weapon pictures, stacked top to bottom at one width (`stack`).

Status 2026-11, plain, read by eye (sheets in `<temp folder>\cardlook\plain\`):

| game | kind / class | verdict |
|---|---|---|
| AS64 | card vehicle ger (full, strip31) | good: parchment gradient, light/dark frame lines, red pressed, grey locked; pressed red paler than the game's |
| AS64 | card gun | usable: larger, trail cut by the frame |
| AS64 | card infantry usa strip32 | usable: strip in measured colours (from the most used strip variant), silhouette weapons; frame line faint |
| AS64 | small vehicle ger | good |
| AS64 | squad infantry eng | good: shield + emblem, chevrons without |
| AS64 | portrait infantry eng / hero | usable: plain backdrop + bust works with renders (the game path was wrong for heroes) |
| GoH | card vehicle eng | good / usable |
| GoH | card infantry eng | usable: weapons centred, stacking works |
| GoH | squad usa | good: shield outline |
| GoH | portrait usa | good: clear backdrop with fade |
| GoH | shop vehicle, small vehicle | run without error, not looked at closely |

## Part 3: render path

The GUI renders the picked unit (skin and variant of the page) in the existing 3D viewer on an offscreen canvas at 4x the card
size with a transparent background, polled with timers, not rAF (a hidden pane stalls rAF). Camera presets per game and
group (`lib/camera.js`, azimuth/elevation degrees): AS2 vehicle -38/22, gun -55/18, infantry 90/0, hero -30/8, portrait -25/4,
scheme 0/89 (top view); GoH vehicle -80/12, gun -70/12, infantry and hero -60/6 [I: chosen to match the vanilla cards by eye].
The scene is turned on the server (`camera.turnScene`) so the viewer's fixed angle gives the preset. The PNG goes to the
server and through the same pipeline as an image.

## [T] rows that matter most

- T1 the mod's `.ebm` with 4 frames is read in place of the game's (hover/pressed/locked show) on the buy panel.
- T2 a new portrait name + breed line in the mod: squad button and portrait both switch, other breeds keep theirs.
- T3 scheme made from a render shows as a usable damage panel under the multiply blend.
- T4 GoH sizes and the shop kind: card, small, shop and portrait seen in game at the written size.
- T5 alpha edges of a keyed image look clean on the in-game plate (TGA 32-bit, not premultiplied).
- T6 a card built from the GIMP layers (frame states 1..3) reads the same as its neighbours on the buy panel; fidelity is a file
  measure only.
- T7 "match this mod's style" on a mod that restyles a class (RobZ-like cards): the new card matches the mod's, not the game's.

## Check codes

`UC-SIZE` size differs from the game's, `UC-FRAMES` frames missing, `UC-EBM` the game has an `.ebm` and the mod has frames but no `.ebm`,
`UC-PNG` a `.png` shadows the `.tga`, `UC-ALPHA` no alpha where the game uses it, `UC-PORTRAIT` a breed names a portrait that
does not exist, `UC-READ` a picture that does not decode.

## Test

`sh tools/unitcard/test/run.sh`: builds a fixture game (generated cards, defs, breeds, one `.ebm`) and scratch mods under
`$UC_TMP`, else `<temp folder>`, else the OS temp; seeded defects for `check`; layers, layer on/off, class numbers
badge pick, cutouts without GIMP (`ARSENAL_GIMP=none`); removed after (`UC_KEEP=1` keeps it).
GIMP part: `node tools/mcp/test/gimp.test.js` (real GIMP runs when installed, refusals only when not).
GoH smoke: `node tools/unitcard/test/goh-smoke.js` runs every GoH kind on the real install (needs a GoH install, a few minutes,
not in `run.sh`).
