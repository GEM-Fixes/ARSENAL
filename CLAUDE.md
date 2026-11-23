# CLAUDE.md: ARSENAL, modding tools for MoW:AS2, AS64 and Gates of Hell

Work: build modding tools, write data and script mods, test them in game, read logs.
Knowledge: guide/ (the modding guide book, start at guide/README.md) and the `mow-*` skills in .claude/skills, which route a task to the tools. Load the least that answers.
Tags in skills and tool notes: [V] verified, [I] inferred, [T] needs an in-game test. Trust [V]; confirm [T]/[I] before a tool depends on it.
IDs like `VFS-01` or `GHDMG-17` in tool messages name a known limitation; the tool's message says what it means.

## Rules
- Game install and vanilla data are read only: tools read them and write only to a mod folder the user names.
- Text data CRLF; string values UTF-8, identifiers ASCII; vanilla comments may be cp1251 (keep the bytes). `.lng` is UTF-8. Paks are zip.
- Tools: node only. After a change run the changed tool's own `test/run.sh`.
- Verify a data change in game before calling it done; read game.log after.
- GUI change: apply it to every game tab of that page (AS2, AS64, GoH) when it applies.
- GUI search or filter box: the shared `searchKit` (tools/gui/page.js).
- GUI route or page work: tools/gui/PERF.md first. A page or route added, renamed or removed: run `node tools/mcp/catalog.js` the same turn.
