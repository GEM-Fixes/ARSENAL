# Check a mod, fix what the check finds, read the game log

Checking reads your mod's files and lists what would stop it from loading, crash the game or be ignored, without starting the game. Fixing writes the safe repairs into a separate **patch mod**, a new folder that loads after yours, so your mod is never changed. The game log, `game.log`, is what the game itself wrote on its last run.

## You need

- Your mod folder, picked on the Mods page.
- The game folder known to ARSENAL.
- For the log: the game started at least once with your mod on.

## The quick way

In the [Quick Guided Task](p17-quick-guided-task.md) row above the tabs, set "I want to" to **change** and choose **a mod with problems (fix them)**. The task looks for problems, makes the safe fixes after a review, and then walks you through the rest one per screen. For the log, set "I want to" to **explore** and choose **what went wrong in the last run**: it lists the errors of the last run in plain words, with the file and line and what to do, and offers the fix task next. It writes nothing.

## Steps

1. **Check the mod.**
   In the window: open the Check page (Mods > Check & Fix > Check). Its guided fix has seven steps: "Pick the mod", "Check", "Review findings", "Choose fixes", "Apply into a new folder", "What changed and next steps" and "Fix the rest by hand". "quick check" skips the slow deep scans; the page ticks it for you on a big mod and unticks it on a small one (under 300 files), and your own tick wins. Press "Check the mod".
   On the command line:
   ```
   ARSENAL check <mod folder>
   ARSENAL check <mod folder> --fast
   ARSENAL check <mod folder> --plain
   ```
   The verdict is `LOADS_STATIC` (no known crash pattern found), `LIKELY_CRASH` or `REFUSED` (the game would not load it). The exit code is 0 for `LOADS_STATIC`, 1 otherwise. `--plain` prints the result in plain words only: one line for the overall result, then one line per finding.

2. **Read the findings.**
   In the window: "Review findings" shows one card per problem, most serious first, with "Where", "Why it matters" and "How to fix". "Open in Editor" jumps to the line in the Editor page.

3. **Choose and apply fixes.**
   In the window: under "Choose fixes", the safe fixes are ticked for you; fixes marked "check after" change how something looks and start unticked. "Select all", "Select none" and "Only safe fixes" set the ticks at once. Fill in the "patch folder" (a new folder, not inside your mod), press "Apply ticked fixes" and confirm in the [confirm box](19-toolchain.md#the-confirm-box). A finding's "Rerun ... alone" button runs only the tool that found it again.
   On the command line:
   ```
   ARSENAL fix <mod folder> plan
   ARSENAL fix <mod folder> apply --out <patch folder>
   ```
   `plan` writes nothing. To undo, delete the patch folder. `--only <kinds>` limits the fix to some kinds; among them, `botkeys` removes bot data keys the game does not read, and `lngdup` removes the earlier copy of a text key that a `.lng` file repeats (the later one is what the game shows).

4. **Check again with the patch.**
   In the window: "Check again with the patch" compares the counts before and after.
   On the command line: `ARSENAL check <mod folder> --with <patch folder>`.
   In the game, enable the patch mod together with your mod, the patch after it.

   **Fix the rest by hand.** Problems with no automatic fix stay on their cards with the steps to fix them. "Walk through the hand fixes" shows each place with its lines and the suggested change, and opens it in the Editor ("Previous", "Next", "Next kind", "Done", "Close the walkthrough"). Up to 50 places are listed per kind of problem; check again after fixing to see the rest. What you change there goes into your mod itself, and the Editor keeps a restore point.

5. **Run the game.**
   In the window: the Play page. Switch on "Let ARSENAL start the game" first; then "play: dry run" shows each step and "play" starts a test match and says from the log whether the mod loaded (BOOT).
   On the command line: `ARSENAL play <mod folder> --dry`, then `ARSENAL play <mod folder>`.

6. **Read the log.**
   In the window: open the Read Game.log page (Mods > Check & Fix > Read Game.log) and press "Explain my last game log". The newest `game.log` is read and explained in plain words, each card with "What to do". "Show the game's own text" shows the original lines. "Read every game window" adds the test copies, crash reports and out-of-sync reports.
   On the command line:
   ```
   ARSENAL logtriage <log folder or game.log> --mod <mod folder> --game <game folder>
   ```
   The log is in your Documents folder under `My Games\Men of War - Assault Squad 2\log\`; a test copy writes to `... - instance N`.

7. **Follow a missing mod or unit.**
   On the Read Game.log page, "Why is it missing?" checks the mod's `mod.info`, version lines, folder name and whether it is switched on. "Check this unit" follows a unit from its file to its model, materials, buy card, army and picture, and names the first broken link. "Show what is switched on" lists your mods in the order the game uses.

## Reading a log line yourself

- `[hh:mm:ss] message (/path/file.def, 188)` was raised while a data file was read. The path tells you whether the line is about your mod.
- An `***** Exception *****` block means the game stopped. The common causes are `define not found` (a macro call with no visible definition), `unexpected token` (a missing brace, a wrong word, or a bone or volume name that is gone), and `Resource not found` (a mesh, volume, animation or material that does not exist; check the name and its case).
- `No Stuff found for tags 'X' (may lead to crash)` is the one warning that turns into a crash, when the missing weapon or ammo is used.
- `Localization key redefinition` lines and `Mission ... is skipped` for leftover titles appear in a clean game too. Keep a clean run's log and look for new kinds of message.

## What can go wrong

- **A clean check is not proof.** `LOADS_STATIC` means no known crash pattern was found, not that the mod does what you meant. Wrong but valid values pass every check.
- **The log you needed is gone.** The game overwrites `game.log` at every start and keeps the run before only once, as `game.prev.log`. Copy it before you start the game again.
- **A fix applies to a whole group.** Ticking part of a group applies all of it; the page warns "Fix applies whole groups".
- **A misspelled key is skipped silently by the game.** The check finds it; the log usually does not.
- **Line order in the log misleads.** `Phase ...` lines print after the data warnings, so a warning's position says nothing about whether it came from your mod.

## In Gates of Hell
<!-- goh: GHLOG-07 GHLOG-16 GHVFS-13 GHVFS-27 GHVFS-28 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **Check under the GoH button.** The Check page checks the mod against Gates of Hell. Its fix steps write a Gates of Hell patch mod (`fix --target goh`); the fixes that follow Assault Squad 2 rules are left out, each with a line saying why. The task "a mod with problems (fix them)" still only looks there. On the command line: `ARSENAL check <mod folder> --target goh --goh <GoH folder>`, then `ARSENAL fix <mod folder> plan --target goh`.
- **Read Game.log under the GoH button** reads the `game.log` in the Gates of Hell user folder, and so does the task "what went wrong in the last run". On the command line: `ARSENAL logtriage --exe goh`. Many Gates of Hell lines still come out as unknown kinds; `[LUA]` lines are read.
- **Where the log is.** Under Documents, `My Games\Gates of Hell\log\`, or under `%LOCALAPPDATA%\Digitalmindsoft\Gates of Hell\log\` when Documents is on OneDrive or the game was started with `-useLocalDataFolder`.
- **Every line** starts with `[hh:mm:ss]`, warnings too.
- **Mod lines to look for:** `Scanning mods in`, `Found N available mods`, `Mod: activate mod <name>`, `Warning: invalid mod folder name`, `Warning: empty mod.info file found at`, `Warning: failed to load mod` and `Warning! Duplicate mod found`. A folder named with a space, `-` or another sign is skipped with the folder name warning.

## More

- Detail: [chapter 18, Testing and logs](18-testing-and-logs.md) ([the structure of `game.log`](18-testing-and-logs.md#5-the-structure-of-gamelog), [fatal errors and warnings](18-testing-and-logs.md#6-fatal-errors-and-warnings), [letting ARSENAL read the log](18-testing-and-logs.md#9-letting-arsenal-read-the-log), [Gates of Hell summary](18-testing-and-logs.md#gates-of-hell-summary)), [chapter 21, Troubleshooting](21-troubleshooting.md) ([where to look first](21-troubleshooting.md#1-where-to-look-first)), [chapter 19, The toolchain](19-toolchain.md) ([`check`](19-toolchain.md#check-one-command-for-will-this-mod-load), [`fix`](19-toolchain.md#fix-a-patch-mod-for-common-problems), [the confirm box](19-toolchain.md#the-confirm-box), [Quick Guided Task](19-toolchain.md#quick-guided-task)).
- Reference: [r01, mod.info and the mod folder](r01-mod-info-and-folder.md), [r02, Entity definition](r02-entity-definition.md); every Part III entry lists its limits.

<!-- Author: Imperator_Aug (ARSENAL) -->
