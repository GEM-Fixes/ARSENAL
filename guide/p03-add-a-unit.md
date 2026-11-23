# Add a new unit from an existing one

The safe way to add a unit is to copy one that works. The copy gets its own id (the name of its `.def` file and of its price card), its own name text and its own card in the buy panel. It keeps the 3D model of the unit you copied.

## You need

- A mod folder with a `mod.info` (see [Make a mod and see it in the game](p01-first-mod.md)).
- A unit to copy that is in the buy panel of the army where the new unit should appear.
- A new id: lowercase letters, digits and `_`, starting with a letter, 2 to 41 characters, not ending in `_x`.

## The quick way

In the Quick Guided Task row above the tabs, set "I want to" to **make** and choose **a vehicle**, **a soldier** or **a squad**, then press Start. The task asks what to copy, then walks through groups of questions: for a vehicle "Id and name", "Buying and army", "Armour", "Guns", "Icons" and "Texts" among others; for a squad "Members", "Buy card" and "Computer players". Review lists every file before Write; then the task checks the mod and hands the test over to the Play page. See [Use the Quick Guided Task](p17-quick-guided-task.md). The steps below show the Units page and the command way.

## Steps

1. **Pick your mod and the unit to copy.** Open the Units page, pick your mod under "Mod folder", and find the unit in "Find a unit".

2. **Fill in the copy.** In "Add a unit (copy)", type the New id, the Name players will see, and the Price. Leave "also copy the wreck (_x)" ticked, so that a destroyed vehicle leaves a wreck. Tick "bots buy it" if computer players of that army should buy the new unit too. Press Preview to see the new id and the files it will write, then Write. The copy is a new [`.def` file](r02-entity-definition.md#def-file) and a new [card](r11-mission-files.md#13-units) in the army's list.

3. **Or describe it in words.** In "Describe a new unit", write what you want, for example "fast Soviet heavy tank with a big gun, cost 900, called Molot". ARSENAL picks the closest game unit, copies it under a new id and gives the copy its own gun file, armour, speed, price, name and buy panel line. The built-in reader runs on your computer; the AI tick sends the text to an outside service and needs your own key. Read the "Understood" and "Assumed" lines before you write.

4. **The command way.** `gen` builds the same from a recipe file (a spec):

   ```
   ARSENAL gen --sample clone-unit > newunit.yaml
   ARSENAL gen newunit.yaml --target as64 --out mymod_units --plan
   ARSENAL gen newunit.yaml --target as64 --out mymod_units
   ```

   Edit the sample before you run it: the `clone` step names the unit to copy (`entity`) and the new id (`as`); the `roster` step puts it on an army's buy list (`unit` is the new id again, `like` the card to copy, `army`, `fields: {cost: ...}`, and `bots: true` for computer players). `gen` writes a new mod folder, never into your existing one. On Tools & Settings > Other Tools > Generator the same recipe file goes into the spec box, with the target and place chosen beside it. To describe in words from the command line: `ARSENAL gen --describe "fast Soviet heavy tank, cost 900" --target as64 --out mymod_units --plan`.

5. **A new infantry squad.** The `squad` step of `gen` copies a squad and sets its members as `"breed:count"`, for example `["squadleader:1", "rifle:5"]`. See `ARSENAL gen --sample squad`. A member is a soldier type, a [breed](08-infantry-and-humans.md#6-breeds) file.

6. **Give it its own look and icon.** The copy uses the buy panel picture named after its card id, which the game does not have yet. See [Icons and interface](p08-icons-and-interface.md). For a different model see [Edit a model or an animation](p06-edit-a-model.md).

7. **Check and look.** Check the mod (`ARSENAL check mymod`), then play a test match. Go through the "Buy panel checklist" on the Units page: right army and button group, a name and not a key, price and rank, unlock, spawn, move, fire, wreck.

## What can go wrong

- **The new unit shows a key instead of a name.** A name key that no `.lng` file defines is shown as the key itself, with no error. A key that the game's `desc.lng` also has keeps the game's text. The Units page writes the name into the right file.
- **Bots never buy it.** Computer players buy only units listed by exact card name in `bot.data.lua` (its [`Purchases`](r12-bot-lua-and-console.md#purchases) table; see [Bots: what they buy and how they play](p11-bots.md)). Tick "bots buy it" and copy a unit that bots of that army already buy.
- **Your bot list hides another mod's.** To add a unit for bots, your mod ships its own copy of the bot buy list. It replaces the game's list as a whole, so another mod that changes bot buying is covered by yours.
- **Your army list hides another mod's.** Your copy of an army's unit list replaces the game's list whole: of two mods adding units to one army, only the lower one in the Activated list counts.
- **The copy does not appear at all.** Two `.def` files with the same name: the first one loaded wins and the other is ignored. Use an id that no game unit and no other active mod uses.
- **The buy panel shows an empty picture.** A missing picture shows nothing or a stub, with no error. Add the icon frames for the new card id.
- **A soldier type is missing from a new squad.** Each breed in `members` must exist as `set/breed/mp/<army>/<breed>.set`.
- **A model mix looks wrong.** When "Describe a new unit" joins the hull of one vehicle with the turret of another, the turret can sit wrong and recoil or crew seats can be off (unconfirmed). Look at the unit in the editor before you share it.
- **Players cannot join each other.** Every player in a match needs the same version of your mod.

## In Gates of Hell
<!-- goh: GHMIS-84 GHMIS-85 GHGPL-10 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **ARSENAL under the GoH button** has the Units page: "Add a unit (copy)" copies a Gates of Hell unit, and a buy holds soldiers only. "Describe a new unit" is not available there, and the Quick Guided Task's vehicle, soldier and squad tasks are greyed out. The Generator (Tools & Settings > Other Tools) and `gen` take `--target goh`: `ARSENAL gen newunit.yaml --target goh --out mymod_units --plan`.
- **What `gen` can do there.** The `clone`, `roster`, `card`, `squad`, `breed` and `text` steps work. The `gun`, `weapon`, `kitbash`, `shell`, `item`, `sound`, `skin` and `mission-clone` steps, and `gen --describe`, are for Assault Squad 2 only.
- **Unit lists are per period.** Cards live in `set/multiplayer/units/<period>/units_<army>.set`; `gen` uses the period `late` unless the step names another. A squad goes into the same file, and a soldier type is declared in `units/<period>/inf_<army>.set` with its breed file under `set/breed/mp/<army>/<period>/`.
- **Bots.** `gen` does not add a new unit to Gates of Hell's computer players.
- **Card keys** differ: see [Change a unit's numbers](p02-change-unit-numbers.md#in-gates-of-hell). A card can also carry `doctrine`, `conditions` and `action`.
- **Names.** `gen` writes the names into a `.pot` file under `localizations/default/interface/text/` (see [Add or change text and translate it](p07-text-and-translation.md#in-gates-of-hell)).

To go the other way and bring a Gates of Hell vehicle into Assault Squad 2, use the GoH unit page: [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

## More

- Part II: [Data keys and entities](06-data-keys-entities.md), [Units, vehicles and movement](07-units-vehicles-movement.md#7-tuning-in-the-arsenal-window), [Infantry and humans](08-infantry-and-humans.md#9-changing-soldiers-and-squads-in-the-arsenal-window), [AI and bots](10-ai-and-bots.md), [Localization](14-localization.md#4-key-families), [The toolchain: Units and Balance](19-toolchain.md#units--balance-all-games).
- Part III: [Entity definition](r02-entity-definition.md), [Interface and localization keys](r09-interface-and-localization.md), [Mission files and multiplayer setup](r11-mission-files.md), [Bot Lua and console](r12-bot-lua-and-console.md#6-bot-data-what-bots-buy).
- Next job: [Change a gun](p04-change-a-gun.md).

<!-- Author: Imperator_Aug (ARSENAL) -->
