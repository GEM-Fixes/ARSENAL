# Modding Men of War: Assault Squad 2

Author: Imperator_Aug (guide and A.R.S.E.N.A.L, the All-in-one Resource SDK for Engine Assets & Levels). A mod that loads clean in the editor is half done; a mod that survives a game update is done.

**Join The AS64 Community!** [https://discord.gg/pgmfaaBVbf](https://discord.gg/pgmfaaBVbf)

This book teaches you to change Men of War: Assault Squad 2 (and its 64-bit build, `as64.exe`) by editing the plain text and resource files the game reads. You will change units, weapons, armour, interface text, maps, bots and multiplayer modes without touching the game program itself. Nothing here needs programming skill.

## Who this is for

You are comfortable with a text editor and with folders, and you want to mod the game, but you do not know how the engine works inside. Every page explains a new term the first time it appears, and the [glossary](22-glossary.md) collects them all. ARSENAL, the toolkit that comes with this guide, does most jobs from a window with tabs; every step is also given as a command for those who prefer a terminal.

## The three parts and when to use which

**Part I, By process.** One job per page, the short way: what you need, the steps, what can go wrong and where the detail is. Use it when you know what you want to make ("add a unit", "change a gun", "pack my mod"). If you are new, read [p01](p01-first-mod.md) first, then the page for your job.

**Part II, In detail.** Twenty-two chapters on how each area of the game works. Use it when a Part I page is not enough, when a change does not behave the way you expected, or when you want to understand a whole area before you start. Chapters 1 to 5 are the foundation every other chapter builds on.

**Part III, Reference.** Every key and every function, one entry each, always in the same shape. Use it when you need the exact facts about one name: where it is written, what values the game accepts, and what silently fails, crashes or desyncs. Part I and Part II link to the entries; the PDF contents list every entry so you can find a key by eye.

Read in this order the first time: this page, then Part I, then Part II, with Part III open beside you.

**Gates of Hell.** This book is about Assault Squad 2, but Gates of Hell (GoH) grew from the same engine, and ARSENAL has GoH in the game picker of its header: under it the window shows the same pages, for porting units and for making, checking and packing Gates of Hell mods. So every part also says where Gates of Hell differs. A Part I page ends with a section "In Gates of Hell": what is different when you do that job for Gates of Hell and what ARSENAL can and cannot do under the GoH button. A Part II chapter adds a subsection "In Gates of Hell" to each section where Gates of Hell differs, and a table "Gates of Hell: summary" that names every section of the chapter as different, the same as far as known, or not looked at. A Part III entry adds a line starting "Gates of Hell:" where its key works differently there, and each reference page ends with "Gates of Hell only", the keys and functions only Gates of Hell has. None of these notes has been tested in a running game; each Gates of Hell section says so in its first line, and a note that is less sure says "probably" or "not confirmed". Check them in your own game before you depend on them.

**The engine technical document** is a separate book that describes how the engine of the 64-bit build works, subsystem by subsystem, for programmers and tool authors. This book does not link into it; where it helps, a page names the engine document's chapter in plain words. It is published as its own download, `ARSENAL-engine-docs-public-<version>.zip`, beside the ARSENAL downloads. Copy its `techdoc` folder into the ARSENAL folder and the Docs page of the ARSENAL window shows it ([Whole documents](19-toolchain.md#whole-documents) in chapter 19 says how).

## Contents

### Part I. By process

1. [Make a mod and see it in the game](p01-first-mod.md): the mod folder, `mod.info`, switching the mod on and checking it.
2. [Change a unit's numbers](p02-change-unit-numbers.md): price, health, speed and the other numbers on the price card and in the definition.
3. [Add a new unit from an existing one](p03-add-a-unit.md): copy a working unit, give it its own id, name and buy panel card, or describe a new unit in plain words.
4. [Change a gun or its ammunition](p04-change-a-gun.md): reload time, range, muzzle speed, penetration and damage.
5. [Change armour and see the result](p05-change-armour.md): armour macros, volume thickness and the armour simulator on the Models page.
6. [Edit a model or an animation](p06-edit-a-model.md): model, mesh, volume and animation files, the Models page and SOEdit.
7. [Add or change text and translate it](p07-text-and-translation.md): `.lng` files, text keys and translation.
8. [Icons and interface](p08-icons-and-interface.md): buy panel icons, portraits, squad pictures and buttons.
9. [Copy and change a map](p09-copy-and-change-a-map.md): your own copy of a multiplayer map, its lobby name and objects placed on it.
10. [Missions and multiplayer modes](p10-missions-and-modes.md): game cards, mode files, starting money, army size and checking a mission.
11. [Bots: what they buy and how they play](p11-bots.md): making bots buy your units, their difficulty and their way of playing.
12. [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md): a Gates of Hell unit built on top of a working donor unit.
13. [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md): Classic and Enhanced mode and the version lines that pick between them.
14. [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md): checking without the game, the patch mod and `game.log`.
15. [Pack and share](p15-pack-and-share.md): version lines, packing, multiplayer compatibility and publishing.
16. [Find guides and tools others made](p16-find-guides-and-tools.md): the Guides & External Tools page and its offline index.
17. [Use the Quick Guided Task](p17-quick-guided-task.md): the row above the tabs, its 27 tasks, what they write and where, and which task does the job of each page above.
18. [Work with Claude: skills and MCP servers](p18-work-with-claude.md): the skills and the two servers that let Claude look things up, check and change a mod, answer questions about playing, and work the ARSENAL window, for all three games.

### Part II. In detail

1. [Getting started](01-getting-started.md): what soft-code modding is, what you can and cannot change, and your first small mod.
2. [Install layout](02-install-layout.md): a tour of the game folder, your user data and the executables.
3. [Mod folder and load order](03-mod-folder-and-load-order.md): `mod.info`, activation, ordering, and Classic against Enhanced mode.
4. [Virtual file system, paks and patches](04-vfs-paks-patches.md): how files override each other.
5. [The SDL language](05-sdl-language.md): the syntax shared by all data.
6. [Data keys and entities](06-data-keys-entities.md): the anatomy of an entity and how to add one.
7. [Units, vehicles and movement](07-units-vehicles-movement.md): chassis, physics and pathfinding.
8. [Infantry and humans](08-infantry-and-humans.md): soldiers, abilities, morale and inventory.
9. [Weapons, ammo and damage](09-weapons-ammo-damage.md): penetration, armour, blast and fire.
10. [AI and bots](10-ai-and-bots.md): how units choose targets and how multiplayer bots work.
11. [Interaction scripts](11-interaction-scripts.md): the `{on event}` language.
12. [Missions and multiplayer setup](12-missions-and-multiplayer-setup.md): game modes, budgets, mission scripting and sync.
13. [Maps](13-maps.md): map folders, terrain and map points.
14. [Localization](14-localization.md): `.lng` files and adding text.
15. [Interface and icons](15-interface-and-icons.md): data-driven interface, icons and hotkeys.
16. [Effects, sound and models](16-effects-sound-models.md): vision, effects, sound and asset formats.
17. [Balance, pricing and gameplay](17-balance-pricing-gameplay.md): what your data changes mean for players.
18. [Testing and logs](18-testing-and-logs.md): the test loop and reading `game.log`.
19. [The toolchain](19-toolchain.md): the ARSENAL window and tools (the Quick Guided Task among them), their commands and the order to run them in, with a section on porting from Gates of Hell.
20. [Packaging and release](20-packaging-and-release.md): paks, checks, multiplayer compatibility and the Workshop.
21. [Troubleshooting](21-troubleshooting.md): symptoms, causes and what to attach when asking for help.
22. [Glossary](22-glossary.md): every term in alphabetical order, with chapter pointers.

### Part III. Reference

1. [mod.info and the mod folder](r01-mod-info-and-folder.md): `mod.info` keys, mod folder items, patch documents and which file wins.
2. [Entity definition](r02-entity-definition.md): top-level keys and blocks of a `.def` file, common stuff keys and the shared data sets.
3. [Extenders and components](r03-extenders-and-components.md): every extender type and its keys.
4. [Chassis, movement, wheels and tracks](r04-chassis-and-movement.md): chassis types, engine and gears, pathfinding profiles, obstacles and physics.
5. [Humans](r05-humans.md): breed, skills, perks, veterancy, abilities, inventory and the stance machine.
6. [Weapons and ammunition](r06-weapons-and-ammunition.md): timing, range, aim, damage, penetration, bursts, ammunition and the weaponry block.
7. [Armour, volumes and damage](r07-armour-volumes-damage.md): armour macros, volumes, materials and how damage reaches parts.
8. [Vision, effects and sound](r08-vision-effects-sound.md): sight, effects, sounds and the model file.
9. [Interface and localization](r09-interface-and-localization.md): action files, command panels, hotkeys, HUD settings and the rules of `.lng` files.
10. [Interaction scripts](r10-interaction-scripts.md): every event, command and condition of the interaction script language.
11. [Mission files](r11-mission-files.md): mission commands, triggers, conditions, game mode cards, budgets, units, armies and map files.
12. [Bot Lua and console](r12-bot-lua-and-console.md): the Lua functions a multiplayer bot may call, bot data, and console commands.

## Conventions

- **Placeholders.** `<game folder>` is the folder where the game is installed. `mods/mymod/...` is a path inside your own mod. Always work in your own mod folder and treat the game folder as read-only.
- **Encoding.** Text data files (`.def`, `.ext`, `.set`, `.mi`, `.patch`, scripts and similar) use CRLF line endings. The 64-bit build reads every string value as UTF-8, in data and `.lng` files alike; a string saved as cp1251 shows as boxes. Identifiers must be plain ASCII. Original data is ASCII outside `;` comments, where some old cp1251 bytes remain; leave them as they are. Paks are ordinary zip files. Many editors silently change encoding or line endings when you save, so check yours.
- **Unconfirmed.** A fact that is not proven carries the word "(unconfirmed)". Do not build on it without trying it in your own game first.
- **Window and commands.** Part I gives the ARSENAL window way first (tab and button names as they are on screen) and the command way second. Commands are written as `ARSENAL <tool> ...`. Without `npm link`, type `node tools/as2/as2.js <tool> ...` from the repository root; [chapter 19](19-toolchain.md) explains both.
- **Page layouts.** A Part I page has "You need", "The quick way" (when a Quick Guided Task does the job), "Steps", "What can go wrong", "In Gates of Hell" and "More". A Part II chapter has numbered sections, "In Gates of Hell" subsections, a "Gates of Hell: summary" and a "Pitfalls" list. A Part III entry has the lines Where, Type, Values, Does, Limits, Example and See, in that order, and a page ends with "Gates of Hell only".
- **Links.** A link to another page goes to the right place in the PDF too. Links to a reference entry name the key, for example [`range`](r06-weapons-and-ammunition.md#range).

## Where to go when you are stuck

Look the word up in the [glossary](22-glossary.md). If the game closes, or a change does nothing, use the symptom lists in [chapter 21](21-troubleshooting.md) and read the log as [p14](p14-check-fix-read-log.md) shows. If you want a tool to do the checking, [chapter 19](19-toolchain.md) lists the tools and the order to run them in. In the ARSENAL window, the Quick Guided Task **explore** tasks ("what went wrong in the last run", "what is possible") answer in plain words; see [p17](p17-quick-guided-task.md).
