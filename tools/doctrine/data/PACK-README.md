# Men of War doctrine pack

WW2 small-unit tactics, read from period manuals and restated for the Assault Squad 2 bot AI on vanilla, RobZ or any mod.

| Path | What it is |
|---|---|
| `atlas.html` | The whole pack as one page. Open it in a browser; it needs no network. |
| `markdown/` | The same doctrine as small text files for an AI to load a piece at a time. Start at `markdown/INDEX.md`. |
| `sdk/doctrine.json`, `sdk/doctrine.lua` | Schema 1: 38 rules, 9 personas, 7 voices, 10 missions, 2 mod profiles. |
| `sdk/SCHEMA.md`, `sdk/README.md` | Data format and the tools that make and check it. |
| `sdk/missions/` | One briefing per mission kit. |
| `sdk/samples/`, `sdk/aar/` | Sample match logs, the reports made from them, and a blank answer sheet for the scenario test set. |

## Markdown layer, from short to deep

1. `INDEX.md` routes a task to the files it needs.
2. `core.md`, `profiles/<mod>.md`, `cards/<rule>.md`: what to do. A typical task loads under 10 KB.
3. `cells/<compartment>.md`: the method behind a card, every line cited, plus known gaps.
4. `evidence/<compartment>.md`: the cited claims, with document, leaf and page.
5. `game/`: how doctrine maps to the game. `sdk/`: missions, voices, tests, reports, schema.
6. `personas.md` and `modern.md`: only when a lobby names a persona or asks for post-war ideas.

## Limits

- Nothing here has been played in a match. Values marked `design` are starting guesses.
- Germany is mostly described by other armies; Japan and Italy only by others.
- Claims are restated in my own words with citations. No scans or long quotes are included.
- The SDK tools themselves run from the source folder, which holds the claim files they read.
