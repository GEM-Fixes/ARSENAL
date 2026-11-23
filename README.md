# ARSENAL

A.R.S.E.N.A.L (All-in-one Resource SDK for Engine Assets & Levels): modding tools for Men of War: Assault Squad 2, its 64-bit build AS64 and Gates of Hell.

- `tools/` node tools: linters, mod creation, porting, packing, the test loop. Start with `tools/QUICKSTART.md`.
- `tools/gui/` the ARSENAL window: `node tools/gui/gui.js`, then open the address it prints.
- `tools/mcp/` MCP servers for Claude (`.mcp.json`), `.claude/skills/` the matching skills.
- `tools/dist/`, `tools/installer/` build the download package and the installers for Windows, Linux and macOS. Start with `BUILDING.md`; every option is in `tools/dist/README.md`.
- `guide/` the modding guide. `.claude/skills/` the Claude skills that route a task to the tools.

Needs Node.js 18 or newer. Game installs are read only; tools write only to a mod folder you name.

Licence: Apache License 2.0, see `LICENSE`, `NOTICE` and `LICENSING.md`. Credits: `CREDITS.md`. Game names and game data belong to their owners.
