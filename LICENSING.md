# LICENSING

The licence is Apache 2.0 (`LICENSE`), copyright 2026 GEM-Fixes. See also `NOTICE` and `CREDITS.md`.

## 1. Covered

The project's own work in this folder:

| Path | What |
|---|---|
| `tools/` | the modding tools (node), the ARSENAL window, the servers for Claude, their tests and test fixtures |
| `guide/` | the modding guide |
| `limits/` | modding notes: how the games read their data, known limits, differences between the games |
| `.claude/skills/` | skills for Claude |
| `README.md`, `CLAUDE.md`, `LICENSING.md`, `NOTICE`, `CREDITS.md`, `package.json`, `.gitignore`, `.gitattributes`, `.mcp.json` | project files |

Test fixtures are small files written for the tests or made by the tests when they run.

## 2. Not covered

- The games themselves: their programs, data, text, textures, models, sounds, maps and archives. None of it ships here. The tools read a game or a mod that is already installed on the user's machine, and write only into a mod folder the user names.
- Mods made by other people. The notes may name a mod and say what it changes; they hold none of its files.
- Other programs the tools can start or download when the user asks (Blender, GIMP, SOEdit, a browser). Each keeps its own licence and none is included.
- The Node.js runtime, when a tool is run from a built single-file executable (MIT licence; its text ships with that executable).
- Anything a later change brings in from another project keeps its own licence and is listed here when added.

## 3. Where the facts come from

The notes and the data tables in `tools/` describe how the games read their files and behave in play. They come from the games' own data files, their logs, and tests run in the games. They hold no code of any game.

## 4. Other people's terms

- No code from another project is copied into the covered paths.
- SOEdit is not included. The window downloads SOEdit's own release from https://github.com/ThatFrostyy/SOEdit-PatchByFrostyy when the user asks.
- Blender add-ons and similar tools are used by running them, not by copying from them.

Men of War, Assault Squad, Call to Arms and Gates of Hell are the property of their respective owners. This project is not affiliated with or endorsed by them.
