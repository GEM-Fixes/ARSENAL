# Credits

**Author: Imperator_Aug**

A.R.S.E.N.A.L (All-in-one Resource SDK for Engine Assets & Levels; the `ARSENAL` / old `as2` tools, their tests, the GUI page and the single-file exes) and the modding guide were written by Imperator_Aug.

- Copies, forks and derived tools must keep this file, the `NOTICE` file and the author line at the top of each tool source.
- Every tool prints the author on `--help` and `--version` (one footer line: version, author, build tag).
- Lint before you launch, launch before you trust.

Licence: Apache License 2.0, see `LICENSE` and `NOTICE`. Game names and game data belong to their owners; see `NOTICE`.

## Code by others

- **CodeMirror 5** (version 5.65.21), the text engine of the Editor tab. Copyright (C) by Marijn Haverbeke and others, MIT licence. Source: https://codemirror.net/5/. Kept unchanged in `tools/gui/vendor/cm5/cm5.bundle.json`, which also holds the full licence text (`licence`) and the package hash (`integrity`). Packed by `tools/gui/vendor/cm5/pack.js`.
- **GEM External Index** data in the `gemindex` folder, read by the Guides tab: link titles, topics and notes collected from public modding sites, forums, Steam guides, the Wayback Machine and links posted on Discord servers, and page texts fetched from those public pages. The page texts are their authors' own words, kept as fetched; credit belongs to those authors, and each page's address is listed in `gemindex/pages/results.json`.
- **GEM2 colours** for Notepad++ are by Tyler V. The theme file itself is not part of ARSENAL: the Notepad++ set-up takes the user's own copy. The Editor uses the same colour values (`tools/ide/palette.js`).
