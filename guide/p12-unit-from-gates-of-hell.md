# Bring a unit from Gates of Hell

Gates of Hell (GoH) and Assault Squad 2 (AS2) grew from the same engine, but their data does not carry over one to one. ARSENAL builds the AS2 unit on top of a **donor**: an AS2 unit of the same kind that already works in the game. The GoH unit brings its model, textures, animations and name; the donor brings crew places, weapon slots and armour layout. The result is a start to test in the game.

A ported unit holds GoH files. It is for your own computer only and can never be shared or uploaded.

## You need

- Gates of Hell and Assault Squad 2 installed on the same computer. Both are only read.
- The AS2 game folder known to ARSENAL (Mods page).
- An output folder for the new mod. Inside the AS2 folder only `mods/<name>` is allowed, and nothing inside the GoH folder. The window offers a new folder in the game's `mods` folder.

## The quick way

In the [Quick Guided Task](p17-quick-guided-task.md) row above the tabs, set "I want to" to **make** and choose **a unit from Gates of Hell**. The task asks for the unit and its donor, then shows the numbers that do not fit one by one (keep the AS2 scale, the translated value or the donor's), asks how players buy it (army, the card it sits next to, cost, name, icon and whether bots buy it), and brings it over into an Assault Squad 2 mod after a review. "More choices" holds the converter's switches and the two game folders. It works under the 64-bit build and under the GoH button.

## Steps

1. **Pick the GoH unit.**
   In the window: pick GoH in the game picker of the header. The header then shows the GoH folder and the AS2 folder the results go to. Open the Units & Balance tab (Alt+7) and pick GoH unit in the row above the page. Under "1. Pick the GoH unit", type part of a name, for example `panzer4j`, and press "Search". Click a unit in the list.
   On the command line, you name the unit exactly with `--entity` in step 3. An unknown name ends with `PORT_NOT_FOUND`.

2. **Pick the donor.**
   In the window: under "2. Pick the donor", type an AS2 unit name, or press "Suggest donor". The page shows the best three in the same class, compared by gun size, armour, drive type and crew, each marked "good match", "fair match" or "weak match". Press "Use this donor".
   On the command line:
   ```
   ARSENAL donorpick --goh "<GoH folder>" --game <game folder> --entity <unit>
   ```
   With no fitting candidate it reports no donor rather than guess.

3. **Convert.**
   In the window: under "3. Convert", check the "Output folder", press "Preview (writes nothing)" and read the findings, warnings first. Then press "Convert and write" and confirm.
   On the command line:
   ```
   ARSENAL goh2as2 --goh "<GoH folder>" --entity <unit> --donor <AS2 unit> --rep-key --pull-props --mtl-fallback --match-weapon --no-ask --game <game folder> --out <output folder> --dry-run
   ```
   Remove `--dry-run` to write. With a donor, speed, turn, mass, fuel, armour and crew values are translated to the AS2 scale. Without `--no-ask` it asks about each value outside the usual range.

4. **Read what changed.**
   The page lists "What changed vs the GoH tank" and "Translated values" with a column "Advice" for each value.
   To decide value by value, open the fold "Translate numbers" in step 3: "Translate" asks one question per value that is unusable or outside the AS2 range of its class, with three answers: "AS2 scale" (the GoH value mapped onto the range AS2 units of this class use), "Translated" (the translation table's value) and "Donor" (keep the donor's own value). Keys 1 to 3 pick, Enter takes the default, and R keeps the answer for the rest of the class. "Translate, never ask" takes every default, the AS2 scale.

5. **Fit the model to the rules.**
   In the window: under "Fit check", press "Run the fit check". It checks that the model has the bones, doors and seats the donor rules expect. "Fix what can be fixed" edits the unit file after you confirm.
   On the command line:
   ```
   ARSENAL donorfit <output folder>/resource/entity/<unit>/<unit>.def --game <game folder> --fit --write --in-place --moddir <output folder>
   ```

6. **Check, install and look at it.**
   In the window: under "Show me my unit", "Show the steps" lists the commands to preview the install, plan a tiny test and place the unit on your own map; the page itself never starts the game. Under "Next step", press "Open in Mods", "Check it", then "Go to Play".
   On the command line:
   ```
   ARSENAL check <output folder>
   ARSENAL install <output folder> --name <mod name> --game <game folder> --dry
   ARSENAL install <output folder> --name <mod name> --game <game folder>
   ```
   Then activate the mod after `as64+` in Options, MODS, and try the unit in a match: that it moves, fires and takes damage.

## What can go wrong

- **The crew is cut to the donor's places.** Seats are bound to the model and its animations, so the seat count cannot grow in the unit file alone.
- **The gun is swapped for the nearest AS2 gun** when the GoH one has no match.
- **The armour comes from the donor, not from the GoH plates.** GoH extra-hard and cast steel have no equivalent, so their strength bonus is lost. Compare with the donor and test with shots.
- **A penetration table is used only when the ammo tags match exactly.**
- **GoH animation events and some effects are dropped.** AS2 has no animation events.
- **The game stops at loading with `define not found`.** A GoH file calls a macro that its chain of included files does not hold. Include the file that defines it, or rename the call. `ARSENAL check` finds most of these first.
- **The game stops with `Extender not found`.** Some GoH parts, such as a medic tent or a fortification, have no counterpart in AS2. Remove that part from the unit file.
- **The game stops with `Resource not found`** for an animation. GoH can name a folder of animation variants; AS2 takes one file.
- **Speeds look wrong.** GoH speeds run higher than AS2's. Keep the translated values and tune in the game.
- **The output folder is refused.** The tool never writes into the GoH folder, a Workshop folder, or the AS2 folder outside `mods/<name>`. Pick another folder.
- **Packing and sharing are refused.** The packer and the Share page find the GoH files listed in `GOH-ORIGIN.tsv` and refuse to pack or upload the mod.

## In Gates of Hell
<!-- goh: GHKEY-29 GHDMG-37 GHDMG-38 GHDMG-39 GHDMG-53 GHKEY-59 GHFMT-18 GHFMT-19 GHFMT-30 GHVFS-27 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

This page is about Gates of Hell already; this section says what in Gates of Hell's own unit data has no place in Assault Squad 2, so you know what the port leaves behind.

- **Armour volumes** can carry `HighHardness`, `CastSteel <value>` and `Quality` (`no_flaw`, `small_flaw`, `medium_flaw`, `large_flaw`). Gates of Hell lowers or raises a plate's effective thickness with them; Assault Squad 2 has no such words, which is why the port keeps the donor's armour.
- **Ammunition** can carry overmatch tables (`OvermatchCalibre`, `OvermatchFixed`, `OvermatchSlope`) that Assault Squad 2 does not read.
- **Animations.** An animation `file` named without `.anm` is tried first as a folder: every `.anm` in it is a variant, picked per unit. Sequences can be `additive` and carry `events`. Assault Squad 2 takes one file and no events.
- **Materials.** A second `diffuse` line in a `.mtl` is an error in Gates of Hell.
- **The other way round.** A mod for Gates of Hell itself needs a folder name with no space, `-`, `+` or other sign; the GoH button's Check page checks it against Gates of Hell, and Mods > Mods > Upgrade or Port, which shows every upgrade setting under GoH, can plan a port of an Assault Squad 2 mod `--to goh`.

## More

- Detail: [chapter 19, The toolchain](19-toolchain.md) ([Units & Balance under GoH](19-toolchain.md#units--balance-under-goh), [porting from Gates of Hell](19-toolchain.md#appendix-porting-from-gates-of-hell), [Quick Guided Task](19-toolchain.md#quick-guided-task)), [chapter 6, Data keys and entities](06-data-keys-entities.md), [chapter 9, Weapons, ammunition and damage](09-weapons-ammo-damage.md) ([Gates of Hell summary](09-weapons-ammo-damage.md#gates-of-hell-summary)), [chapter 16, Effects, sound and models](16-effects-sound-models.md) ([Gates of Hell summary](16-effects-sound-models.md#gates-of-hell-summary)).
- Reference: [r02, Entity definition](r02-entity-definition.md), [r03, Extenders and components](r03-extenders-and-components.md), [r04, Chassis and movement](r04-chassis-and-movement.md), [r07, Armour, volumes and damage](r07-armour-volumes-damage.md) ([Gates of Hell only](r07-armour-volumes-damage.md#gates-of-hell-only)).
- Next: [Check a mod, fix it, read the log](p14-check-fix-read-log.md) and [Pack and share](p15-pack-and-share.md) (what may not be shared).

<!-- Author: Imperator_Aug (ARSENAL) -->
