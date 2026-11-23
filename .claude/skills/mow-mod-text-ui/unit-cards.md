# Make unit card pictures (buy card, unit list, squad, portrait, scheme, GoH shop card)

Use when the user wants the pictures of a unit made or remade in the game's own style, from an image or a 3D render.
Paths, sizes, frame counts and what names each picture: `tools/unitcard/README.md` part 1 (per game). Do not copy them here.

## In the window (preferred: it has the 3D render)
Units & Balance > Units > tool "Unit card" (all three game tabs). MCP: `gui_open` page `units`; routes
`/api/x/units/card/{kinds,current,styles,cutouts,plan,make,fidelity,gimp,openxcf}` through `gui_call`.
1. Pick the unit. Part 2 shows what the mod and the game show now, beside a game card of the same class.
2. Source: an image file, or a render of the model (camera fitted on the game's cards; Turn / Height / Lens boxes override it).
   A vehicle or gun renders alone, with no crew. A soldier BUY CARD shows the flag strip with a badge and a flat side
   silhouette of the squad's main weapon, not a soldier: pick the weapon in the window. Squad pictures are an emblem on a
   shield (pick a game badge or an own image). A kind with no picture is left out with a reason; Write waits for all chosen kinds.
3. Card style: "Plain" is the default (window choice, CLI `--plate plain`): background, frame, flag strip and shield are
   drawn by code from measured numbers, close to the game's look, with no pixels of the game's art (README part 2e).
   "Layers from the game's cards" (`--plate game`): clean layers of the class (background, flag strip, frame, badge) are read from the game's own cards; layouts
   (strip card, full card, supply card) are told apart per card. `tools/unitcard/README.md` part 2d has the method and status.
   Pick the badge (one found in the game, none, or an own image), switch layers on or off, change scale, foot line, tone.
   "match this mod's style" takes the layers from the mod's own cards when it has 3 or more of the class.
4. Preview every frame at true size and enlarged, with the difference view. Then Write (asks first; writes only into the mod).

## From the command line
```
node tools/unitcard/unitcard.js kinds  --game G
node tools/unitcard/unitcard.js plan   --game G --mod M --unit U [--from image | --render]
node tools/unitcard/unitcard.js make   --game G --mod M --unit U --from image [--preview dir] [--write]
node tools/unitcard/unitcard.js check  --game G --mod M
node tools/unitcard/unitcard.js fidelity --game G
node tools/unitcard/render.js   --game G [--mod M] --unit U [--kinds card,small] [--weapon W] --out dir
node tools/unitcard/unitcard.js sheet --game G [--kind K] [--class C] [--army A] --out dir
```
`render.js` renders without the window (headless browser, about 80 s cold) to `<unit>_<kind>.png`; give that to `make --from`.
`sheet` writes game card | made card | difference at 3x: look at it before calling a class good. Without `--write` nothing is written.

## Cutouts with GIMP (MCP group `gimp`)
- `mow_gimp_status`: is GIMP found (env `ARSENAL_GIMP`; `none` turns it off), which version.
- `mow_card_cutouts`: the full cutout set one unit class needs. `mow_gimp_layers`: split one card into layers.
  `mow_gimp_cutout`: one region of one picture. `mow_gimp_run`: a named job; free script text is not accepted.
- Write tools preview unless `write: true`; targets must sit inside `ARSENAL_WRITE_ROOTS`. Game files are only read.
- Cache: `%LOCALAPPDATA%\ARSENAL\cutouts` (env `ARSENAL_CUTOUTS`). It holds pieces of the game's art: local only, never
  put it in a mod release or a repository. A full set takes about 12 minutes per game the first time.
- Each class has a layered `class.xcf`; "Open in GIMP" opens it. A cutout edited by hand is kept on rebuild (`--force` redoes it).
- No GIMP: the built-in cutter is used and the page says so.

## Limits to tell the user
- GoH portraits are full pictures with no shared background, so layers can not be taken from them: use a template card.
- How close a rebuilt card is to the game's: `fidelity` (numbers per kind and class in the README). GoH squad and hero
  classes and the AS2 damage scheme are above the threshold: check those by eye.
- A portrait shared by several breeds gets a name of its own plus a `{portrait}` line in the breed file copied into the mod.
- After writing: run the mod and look at the buy panel, unit list and soldier panel (skill `mow-mod-test`); nothing here is tested in game [T].
