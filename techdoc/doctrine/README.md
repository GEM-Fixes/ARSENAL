# Doctrine atlas

`atlas.html` in this folder is the Men of War doctrine atlas: one page that shows how good small-unit play worked in the Second World War, taken from the armies' own manuals, and how a bot in Assault Squad 2 can apply it at any game size and on any mod. It has the layers of command, one card per compartment (an echelon, a branch and a phase, such as a company attack) with a diagram, the method with numbers and the cited claims behind it, the game rules that the bot doctrine is built from, the mod profiles, the personas and missions, the modding kit and a section on how solid the material is.

It comes from the Men of War doctrine pack, a separate project of the same author. The page here is the pack's own atlas with the ARSENAL look: the colours and fonts of the ARSENAL window, light and dark, so that it reads like the rest of the Docs page. The content is the pack's: every section, diagram, card, table and filter is kept. A short, fixed list of wording changes does five things. It adds a few explanations of terms, for example what a fit tag or a compartment is. It turns one first-person sentence into the third person. It names the third-party mod profile by a description, "the overhaul mod", and keeps its version. Where the pack cites a source by an id and gives it no title, the citation shows a fixed label, such as "Untitled source 1", and one sentence in "How solid this is" says so. The head no longer carries a fingerprint of the pack page; `--check` tells whether the copy is current. No claim, number, leaf or page is changed.

## Limits

These are the pack's own limits, restated:

- Nothing in the atlas has been played in a match yet. Values marked `design` are starting guesses that nobody has tuned.
- Germany is mostly described by other armies; Japan and Italy only by others. Some compartments (sniper, winter, engineer) are thin.
- Claims are restated in the pack author's own words, each with its citation (document, leaf and page). There are no scans and no long quotes.
- Numbers were checked against machine-read text, not against the page images, so a misread digit can remain.

## Refreshing it

When the pack is updated, run the matcher on the pack's new `atlas.html`:

```
node tools/wholedoc/atlas.js <pack folder>/atlas.html
```

It writes again. The result is always the same for the same pack file. To see whether the copy here is still current, add `--check` (exit 1 when it is not). When the pack's page has a shape the matcher does not know (a new kind of block, an outside resource, a missing filter bar), the matcher stops with exit 2 and writes nothing; extend `tools/wholedoc/atlas.js` before you refresh.

## Related

`tools/doctrine` holds the same pack's data (rules, personas, voices, missions and mod profiles) for the Bot doctrine page of the ARSENAL window, which writes bot settings into a mod. The atlas is the reading side; the Bot doctrine page is the doing side.
