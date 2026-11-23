# Find guides and tools others made

Modders have written guides and tools for the GEM engine games (Men of War, Assault Squad 2, Gates of Hell and others) for years, spread over forums, wikis, file sites and Discord servers. The Guides & External Tools page (tab Help & Docs) searches a saved index of about 9,000 such links, offline. It shows what others made and where; it does not copy or vouch for their work.

## You need

- The guide index folder. It is not part of ARSENAL, because its saved pages are other sites' text. It is a folder that holds a `guides.json` file and a `builtin` folder.
- A web browser for opening the links.

## Steps

1. **Point ARSENAL at the index.**
   In the window: open Help & Docs > Guides & External Tools. If it says "The guide index was not found", it lists where it looked; press "Pick the index folder". It is used until ARSENAL closes; "Use another index folder" and "Back to the default folder" switch it later.
   On the command line: every `gemindex` command takes `--data <folder>`. Without it the tool looks at the environment variable `GEM_INDEX_DIR`, then at a `gemindex` folder next to the exe.

2. **Search.**
   In the window: on the "Search" tab, type "Words to find". Narrow with "Show" ("Everything", "Complete guides", "Tools and plugins", "Other links", "History"), "Game" (for this game, "AS2 and AS64 related"), "Topic", "Sub-topic" and "Language". Tick "Also search the saved page text (slower)", "Include links posted on Discord", or "Only copies of closed sites (Wayback Machine)" for forums that are gone. Press "Search".
   On the command line:
   ```
   ARSENAL gemindex search armour penetration --game as2rel --tab guides --text
   ```
   `--tab` takes `guides`, `tools`, `history`, `less` or `all`; `--lang`, `--archived` and `--limit n` narrow further.

3. **Read a result.**
   In the window: "Preview text" shows the saved text of a page. "Open in browser" opens the original in your normal browser.
   On the command line: `ARSENAL gemindex show <id or address> --around <word>` prints the row and an excerpt.

4. **Browse questions, tools and missing pieces.**
   - "Questions and answers" lists answers picked from old forum pages by keyword. Command: `ARSENAL gemindex faq <words>`.
   - "Tools by topic" groups the tools and plugins in the index by what they do. Command: `ARSENAL gemindex tools --game as2rel`.
   - "What ARSENAL can and can't make" says, for each kind of content (3D models, textures, sound, maps, animation, icons, object editing, mod managers), what ARSENAL does itself and what still has to be made in another program, with guides and tools for each and the ARSENAL page to go to. Models and animations, for example, are edited on the Models page, while a new mesh shape or a painted texture comes from another program. Command: `ARSENAL gemindex gaps --lang en`.

5. **Keep a list.**
   In the window: under "Export these results", pick a "File type", press "Count first" then "Pick a folder and save".
   On the command line: `ARSENAL gemindex export <words> --out links.csv --dry`, then without `--dry`. The file may end in `.csv`, `.md` or `.json`.

6. **Credit what you use.**
   Share the links, not copied page text. The texts belong to each page's author.

7. **Fetch more pages (optional, goes online).**
   In the window: the "Update the index" tab fetches the public pages behind links that have no saved text yet. Choose "Which links" and "At most", then press "Try it first (nothing goes online)" to see the pages and sites. "Start (goes online)" fetches one page at a time and obeys each site's `robots.txt`; "Stop" ends after the current page. Fetched pages are saved only in the index folder, in its `scrape` folder.
   On the command line: `ARSENAL gemindex scrape <words> --missing --limit 25 --dry`, then without `--dry`. `ARSENAL gemindex wayback <id>` lists archive captures of one page.

## What can go wrong

- **"The guide index was not found."** Pick the folder that holds `guides.json`. The "What ARSENAL can and can't make" tab still works.
- **A link is dead.** Many pages are more than ten years old. Try "Only copies of closed sites" or `gemindex wayback`.
- **A download is unsafe.** ARSENAL does not open or safety-check any link. Downloads from these pages are untrusted: scan them first, keep them in their own empty folder, and never run them from inside your game folder.
- **A tool is for another game.** Most tools in the index were made for other GEM games. Check which game a tool is for before you use it on your mod.
- **A Discord link does not open.** Such links often need a server invite, and files there can expire.
- **An answer is wrong.** The "Questions and answers" tab picks answers by keyword rules and nobody has checked them. Treat them as hints; many are in Russian. Confirm them against this guide and in the game.
- **The preview is cut off or shows broken letters.** The saved text is only part of the page, and old pages can carry broken encodings. Open the original for the rest.

## In Gates of Hell
<!-- goh: GHVFS-04 GHVFS-27 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

- **The Guides & External Tools page** is there under every game, GoH included, and searches the same index.
- **Many links are for Gates of Hell.** The index covers all GEM games, and most of the mod managers in it are Gates of Hell tools. Check which game a guide or tool is for before you follow it.
- **Mod layout advice does not carry over.** Gates of Hell reads only `resource/`, `N.pat` and `localizations/` in a mod and skips folder names with a space or `-`; an Assault Squad 2 guide's folder advice can be wrong there, and the other way round.
- **Outside programs.** When a Quick Guided Task sends you to a program that is not on your PC, its card links to this page with the program's name as the search words.

## More

- Detail: [chapter 19, The toolchain](19-toolchain.md) ([Help & Docs](19-toolchain.md#help--docs-all-games), [Whole documents](19-toolchain.md#whole-documents)), [chapter 16, Effects, sound and models](16-effects-sound-models.md), [chapter 22, Glossary](22-glossary.md).
- Inside ARSENAL: the Quick Guided Task **explore** **what is possible** takes a question in your own words and answers it from the game's known limits, the pages of this book and the glossary. See [Use the Quick Guided Task](p17-quick-guided-task.md).
- Reference: check an outside guide's advice against Part III, starting with [r02, Entity definition](r02-entity-definition.md).

<!-- Author: Imperator_Aug (ARSENAL) -->
