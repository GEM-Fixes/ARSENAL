# Use the Quick Guided Task

The Quick Guided Task is the row above the tabs of the ARSENAL window. You say what you want ("I want to make a vehicle", "I want to change the prices of an army") and a task window asks one question at a time, shows what it will write, writes it into your mod, checks it and tells you what to look at in the game. It does the jobs of the other pages of this part from one place. This page shows how to start a task, what each of the 27 tasks does, where a task keeps your answers and what it writes.

## You need

- The ARSENAL window, open on the PC itself. From a phone or another device on the LAN the tasks are greyed: "only on the PC, not from another device".
- The game folder known to ARSENAL (most tasks need it to read the game's own files).
- For every task that writes into a mod: a mod picked at the top of the window. A task can also make a new empty mod for you on its first step.

## Steps

1. **Pick a task.**
   In the window: the row starts with "Quick Guided Task" and "I want to". Pick the verb, **make**, **change** or **explore**, then the task in the list beside it. "Type to filter" narrows the list as you type. Press "Start".
   A greyed task says why: "needs a mod picked", "needs the game folder", "not for" the game picked in the header, "not built yet", or "this task has a fault" with the reason.
   On the command line: the row has no command of its own. Each task runs the same tools as the pages; the Part I page for the job, in the table below, gives the commands.

2. **Choose how many questions.**
   The first step, "Quick or everything", asks "How many questions should the task ask?". Quick asks only the main questions; everything else stays as in the thing you copy (or as it is now, for a change). Everything asks every value, one by one. The switch "How many questions" at the top of the window changes it at any time.

3. **Pick the mod and the thing to copy or change.**
   The step "Mod" asks "Which mod does this go into?" and offers the mod picked at the top. "Make the mod" makes a new empty mod in the game's `mods` folder. The next step, "What to copy" (make) or "What to change" (change), picks the unit, gun, map or other thing to start from.

4. **Answer the questions.**
   The window has three parts: "Steps" (the list of steps, each marked done, kept, to do or needs a look), the question, and "Look" (a preview of the thing: a small 3D view for a model or a unit, a picture, a sound, or the first lines of a text file). "So far" lists your answers. "Next" (Enter) goes on, "Back" (Alt+Left) goes back. "Keep as copied" keeps a value, and "Keep this whole group as copied" or "Ask me this group" skips or opens a whole group of questions.
   Where a question needs a file or another thing, it offers:
   - **Use one that exists in the game or a mod.**
   - **Copy one and change it.** This opens a branch task for that thing ("Open the branch task"); when it is done, "Back to" returns to the task above.
   - **Bring my own file.** "Pick a file from this PC" or "Or pick a whole folder", up to 64 MB. The kind of file is read from its bytes, not its name.
   - **Make it in an outside program.** A card names the program (SOEdit, Blender, an image or DDS editor, Audacity and others), whether it is on this PC, and the steps. "Open it" starts it, "Open the folder with my files" shows where to save, and "I am done: here is my file" or "I am done: it is saved in my mod" brings the result back. ARSENAL never downloads a program; a program that is not on this PC links to the Guides & External Tools page.

5. **Review and write.**
   "Review" lists every answer ("Look over every answer"; "Details" opens one). "Write" lists every file the task will write, with "Write it into the mod". Press "Write" and confirm "Write these files into your mod?" in the confirm box. A restore point is taken first. "Do not write now: save and close" keeps the task for later.

6. **Check and test.**
   "Check" runs the check on your mod ("Check now"). "Test in game" sends you to the Play page; the task window never starts the game itself. "What to look at in game" is a tick list for the match. "What next" offers "Make another", "Make one like it", "Back to the tabs" and "Share the mod".

7. **Stop and come back later.**
   "Save and close" (Esc) closes the window; every answer is already saved. Back in the row, "Saved tasks" lists your open tasks: pick one and press "Continue" to go on at its step, or "Throw away" to delete it. A page reload opens the open task again.

## The tasks

The window shows each task as the verb plus the title below. Most tasks are for Assault Squad 2, both the 64-bit build and the original program; the last column says which game, picked in the header, they work under.

| Task in the row | What it does | Games |
|---|---|---|
| make a mod | A new mod folder with its `mod.info`: title, folder, description, mods it needs. | both builds |
| make / change a vehicle | A tank, car, gun or other vehicle copied from a game one: model, armour, movement, crew, guns, sight, effects, supply, icons, buy card and texts. | both builds |
| change the armour of a vehicle | An armour preset, millimetres per line, the thickness of each volume, repair times. | both builds |
| make / change a soldier | Name, look, price, portrait, voice, kit, health, skills, sight and the squads that hold the soldier. | both builds |
| make / change a squad | Name, price, members, buy card, icon, and whether bots buy it. | both builds |
| make / change a gun or weapon | Kind, model, ammunition, numbers, sounds, tracers, inventory, mount and the units that carry it. | both builds |
| make / change ammunition | A preset, blast, shaped charge, mass, inventory and the weapons that fire it. | both builds |
| make / change a grenade, mine or item | Model, mass, blast, throw, fuse and inventory. | both builds |
| make / change a skin or camouflage | A texture variant or a soldier's look, or a game texture to paint. | both builds |
| make / change an icon | A buy panel icon, portrait, squad card picture or damage scheme from your PNG or a game icon. | both builds |
| make / change a sound | A sound file, its conversion, its loudness class, and weapon fire and reload sounds. | both builds |
| make / change a voice set | The lines of a soldier, a tank crew or a gun crew. | both builds |
| make an army; change an army: its name, flag, cards and side | Name, flag, the buy cards added, removed or moved, the side and the money tabs. | both builds |
| change prices of an army | The prices of a whole army, command points, score and money rules. | both builds |
| change what bots buy and how they play | What bots buy first, bot money and waiting times, lobby presets, and a way of fighting from Bot Doctrine. | 64-bit build |
| make a map, starting from a game map; change the settings of a map | A copy of a multiplayer map or changes to one: name, players, season, modes, bots, objects, pictures and a start point check. | 64-bit build |
| make a multiplayer game mode; change the rules of a multiplayer game mode | Sides, goals, rules, money, alliances and the units to buy. | 64-bit build |
| make new texts or a translation; change the game's texts or a translation | Lines in `.lng` files, the missing lines added, a translation table merged, then checked. | both builds |
| make a model; change a model of the game or of my mod | A game model copied or your own files brought in: bones, meshes, volumes, animations, the definition, then the Models check. | both builds |
| change an old mod to 64-bit | The upgrade of [Bring an old mod up to the 64-bit build](p13-old-mod-to-64-bit.md), into a new folder; the old mod is only read. | both builds |
| change a mod with problems (fix them) | Checks the mod, makes the safe fixes, then walks you through the rest one per screen. | all three |
| make a unit from Gates of Hell | A Gates of Hell unit on an Assault Squad 2 donor, as in [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md), with its buy card. | 64-bit build, Gates of Hell |
| make a release | `mod.info`, the Workshop picture, the release check, the package, the clean copy and the play card. | both builds |
| explore a unit, gun, map, sound, model or picture | Its numbers, a comparison, its price, what it pierces, its files, where it is used and which of two wins. It ends with "make one like this" or "change this". | both builds |
| explore a mod | The files it changes, its values against the game's, clashes with other mods, the check, its size, and a search. It ends with the fix and release tasks. | all three |
| explore what went wrong in the last run | The errors of the last `game.log` in plain words, with file and line and what to do. It offers the fix task next. | all three |
| explore what is possible | A question in your own words, matched to the known limits of the game, the pages of this book and the glossary. | all three |

"Both builds" means the 64-bit build and the original 32-bit program. Explore tasks only read: they have no review, write, check or test steps.

## Which task for which job

| Job | Task in the row | Part I page |
|---|---|---|
| Start a mod | make a mod | [p01](p01-first-mod.md) |
| Change a unit's numbers | change a vehicle, a soldier, or the prices of an army | [p02](p02-change-unit-numbers.md) |
| Add a unit | make a vehicle, a soldier or a squad | [p03](p03-add-a-unit.md) |
| Change a gun or its ammunition | change a gun or weapon, ammunition, or a grenade, mine or item | [p04](p04-change-a-gun.md) |
| Change armour | change the armour of a vehicle | [p05](p05-change-armour.md) |
| Edit a model or a skin | make or change a model, a skin or camouflage | [p06](p06-edit-a-model.md) |
| Text and translation | make or change texts or a translation | [p07](p07-text-and-translation.md) |
| Icons | make or change an icon | [p08](p08-icons-and-interface.md) |
| Copy and change a map | make a map, starting from a game map | [p09](p09-copy-and-change-a-map.md) |
| Game modes | make or change a multiplayer game mode | [p10](p10-missions-and-modes.md) |
| Bots | change what bots buy and how they play | [p11](p11-bots.md) |
| A unit from Gates of Hell | make a unit from Gates of Hell | [p12](p12-unit-from-gates-of-hell.md) |
| An old mod to 64-bit | change an old mod to 64-bit | [p13](p13-old-mod-to-64-bit.md) |
| Check, fix, read the log | change a mod with problems; explore what went wrong in the last run | [p14](p14-check-fix-read-log.md) |
| Pack and share | make a release | [p15](p15-pack-and-share.md) |
| Find out what is possible | explore what is possible | [p16](p16-find-guides-and-tools.md) |

Sounds, voice sets and armies have no Part I page of their own: see [chapter 16, Effects, sound and models](16-effects-sound-models.md) and [chapter 12, Missions and multiplayer setup](12-missions-and-multiplayer-setup.md) (armies).

## What it writes and where

- **Your answers.** One file per task in ARSENAL's own data folder, `%LOCALAPPDATA%\ARSENAL\tasks`, saved on every answer. Files you bring wait in a folder of the system's temporary folder until the task writes them.
- **Your mod.** Only "Write" changes the mod, and only the files the Write step lists. "Make a mod" makes a new mod folder, the upgrade task writes a new folder next to the old mod, and the release task also writes the package and the clean copy into the folder you pick, outside the mod.
- **Restore points.** Before a file is written, a restore point is taken in a folder next to your mod, named after it with `.arsenal-undo`. Undo a write in the Editor's Restore points panel ("Open the restore points").
- **Never.** The game folder and other mods are never written, and the game is never started from the task window.

"Throw away" asks "Throw this saved task away?". It removes your answers, the files you brought and any branch tasks. Files already written into your mod stay; undo them with the restore points.

## What can go wrong

- **The task you want is greyed.** Read the reason beside it. Pick a mod at the top, set the game folder, or pick another game in the header.
- **A file you bring is refused.** The kind is read from the bytes, so a renamed file of the wrong kind is refused, as is a file over 64 MB.
- **The task stops before writing.** The Write step stops at the first error in its plan, before any file is written. Fix the answer it names and press "Write" again.
- **A write did more than you wanted.** Undo it in the Editor's Restore points panel. A file a tool changed without a restore point is listed as written with no restore point.
- **The outside program is "not on this PC".** Install it yourself; the card links to the Guides & External Tools page.
- **A Quick task kept a value you wanted to change.** Switch "How many questions" to Everything, or open the group with "Ask me this group".
- **Nothing shows in the game.** A written and checked mod still has to be switched on and tested. See [Check a mod, fix it, read the log](p14-check-fix-read-log.md).

## In Gates of Hell
<!-- goh: GHVFS-13 GHLOG-07 GHLOG-16 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **Tasks that work under the GoH button:** "a mod" (make), "an old mod to 64-bit" (it makes a Gates of Hell copy), "a mod with problems (fix them)", "a unit from Gates of Hell", and the explore tasks "a mod", "what went wrong in the last run" and "what is possible": seven of the 27. Every other task is greyed "not for" Gates of Hell.
- **"A mod with problems" only looks.** There are no one-click fixes for Gates of Hell: the cards say what to change by hand, and nothing is written.
- **"A unit from Gates of Hell" writes into an Assault Squad 2 mod,** not into Gates of Hell. The header shows where the results go.
- **"What went wrong in the last run" reads the Assault Squad 2 log folders.** Gates of Hell keeps its `game.log` under Documents, `My Games\Gates of Hell\log`, or under `%LOCALAPPDATA%\Digitalmindsoft\Gates of Hell\log` when Documents is on OneDrive. Read it on the command line: `ARSENAL logtriage <that log folder>`. Every Gates of Hell log line starts with `[hh:mm:ss]`, and many of its lines are not yet known to the reader.
- **The Play and Share buttons** at the end of a task lead to pages that belong to Assault Squad 2.

## More

- Detail: [chapter 19, The toolchain](19-toolchain.md#quick-guided-task), with [the confirm box](19-toolchain.md#the-confirm-box) and [file viewers](19-toolchain.md#file-viewers).
- Every task in the table above has its Part I page; each page names the task in its section "The quick way".

<!-- Author: Imperator_Aug (ARSENAL) -->
