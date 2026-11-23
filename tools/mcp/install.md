# Installing the ARSENAL MCP servers and skills

Two servers and a set of skills let Claude help with modding and playing Men of War: Assault Squad 2, its AS64 build and Gates of Hell.

- `arsenal` (`tools/mcp/server.js`): knowledge lookups, mod checks and changes, game status and match-ups. Works on its own.
- `arsenal-gui` (`tools/mcp/gui.js`): talks to the ARSENAL window. Start the window first with `node tools/gui/gui.js`.
- Skills (`.claude/skills/`): short guides Claude loads by task. They name the MCP tools first and the command line second, so they also work without the servers.

You need Node.js. Nothing else is installed, and the servers make no network calls. The full list of tools and skills is in [CATALOG.md](CATALOG.md).

## Claude Code, in this repo

Nothing to do. The file `.mcp.json` at the repo root registers both servers. Start `claude` in the repo folder, approve the two servers when asked, and check with `/mcp`.

The paths in `.mcp.json` are relative, so they work when Claude Code is started from the repo root.

## Claude Code, from another folder

Register the servers with full paths. Replace `<repo folder>` with the folder that holds this repo on your computer (for example `C:\Tools\arsenal`; in JSON with doubled backslashes, `C:\\Tools\\arsenal`).

```
claude mcp add arsenal -- node <repo folder>\tools\mcp\server.js
claude mcp add arsenal-gui -- node <repo folder>\tools\mcp\gui.js
```

Add `--scope user` after `add` to have them in every project. Settings go in with `--env`, before the server name:

```
claude mcp add --env ARSENAL_GAME=goh --env ARSENAL_WRITE_ROOTS=D:\my-mods arsenal -- node <repo folder>\tools\mcp\server.js
```

`claude mcp list` shows them, `claude mcp remove arsenal` takes one out.

## Claude Desktop

Open Settings, Developer, Edit Config. That opens `claude_desktop_config.json` (on Windows in `%APPDATA%\Claude`, on macOS in `~/Library/Application Support/Claude`). Add the two servers under `mcpServers`, with full paths and doubled backslashes, then close and reopen Claude Desktop.

```json
{
  "mcpServers": {
    "arsenal": {
      "command": "node",
      "args": ["<repo folder>\\tools\\mcp\\server.js"],
      "env": {
        "ARSENAL_GAME": "as64",
        "ARSENAL_WRITE_ROOTS": "D:\\my-mods"
      }
    },
    "arsenal-gui": {
      "command": "node",
      "args": ["<repo folder>\\tools\\mcp\\gui.js"]
    }
  }
}
```

Leave out the `env` block to start with everything read-only.

## Load only what you need

The full `arsenal` server gives Claude every tool, and each tool costs context. The tools are sorted into small groups, and the server can be started with only the groups you want: `--groups a,b` after `server.js`, or the setting `ARSENAL_MCP_GROUPS=a,b`. `mow_tools` is always there; it names the groups that are served, the ones that are off and the line that turns them on. No `--groups` = every group.

Register either the full `arsenal` server or group servers, not both: the same tool would then be there twice. In this repo `.mcp.json` registers the full server; to load less here, remove the `arsenal` entry from it (or answer no when Claude Code asks about it) and add the lines you want below. Each line is its own server with its own name, so add as many as you need; `<path>` is the full path of the repo.

One group each:

| Group | What it is for | Line |
|---|---|---|
| `knowledge` | How the games behave, known limits, differences between the games, the guide | `claude mcp add arsenal-knowledge -- node <path>/tools/mcp/server.js --groups knowledge` |
| `mod` | A whole mod: read, new, check, fix, what it changes, which file wins, upgrade, port plan, pack | `claude mcp add arsenal-mod -- node <path>/tools/mcp/server.js --groups mod` |
| `together` | Several mods at once: clashes, patch mod, multiplayer sync | `claude mcp add arsenal-together -- node <path>/tools/mcp/server.js --groups together` |
| `units` | Units: find, stats, change, equipment, look | `claude mcp add arsenal-units -- node <path>/tools/mcp/server.js --groups units` |
| `weapons` | Weapons and balance: find and change a weapon, balance check, price | `claude mcp add arsenal-weapons -- node <path>/tools/mcp/server.js --groups weapons` |
| `text` | Game text: find and set names and translations | `claude mcp add arsenal-text -- node <path>/tools/mcp/server.js --groups text` |
| `maps` | Maps, missions, game modes, placing objects | `claude mcp add arsenal-maps -- node <path>/tools/mcp/server.js --groups maps` |
| `bots` | Bots in a mod: allow them in a mode, what they buy | `claude mcp add arsenal-bots -- node <path>/tools/mcp/server.js --groups bots` |
| `play` | The installed game: status, last log, crash, modes, bots, settings | `claude mcp add arsenal-play -- node <path>/tools/mcp/server.js --groups play` |
| `coach` | Advice for a match: gun against armour, what an army can buy, counters | `claude mcp add arsenal-coach -- node <path>/tools/mcp/server.js --groups coach` |
| `run` | Start and drive the game for a test (needs `ARSENAL_ALLOW_LAUNCH=1`) | `claude mcp add --env ARSENAL_ALLOW_LAUNCH=1 arsenal-run -- node <path>/tools/mcp/server.js --groups run` |
| `assets` | Models, textures, effects and sound | `claude mcp add arsenal-assets -- node <path>/tools/mcp/server.js --groups assets` |
| `scripts` | Interaction and mission scripts | `claude mcp add arsenal-scripts -- node <path>/tools/mcp/server.js --groups scripts` |
| `robz` | The RobZ Realism mod | `claude mcp add arsenal-robz -- node <path>/tools/mcp/server.js --groups robz` |

Several groups in one server, by what you do (the same sets as the downloads on the Claude page of the ARSENAL window):

| Set | Line |
|---|---|
| `modding` | `claude mcp add arsenal-modding -- node <path>/tools/mcp/server.js --groups mod,together,units,weapons,text,maps,bots,assets,scripts` |
| `playing` | `claude mcp add arsenal-playing -- node <path>/tools/mcp/server.js --groups play,coach,run` |
| `games` | `claude mcp add arsenal-games -- node <path>/tools/mcp/server.js --groups knowledge` |
| `gui` | `claude mcp add arsenal-gui -- node <path>/tools/mcp/gui.js` (its own server, no groups) |
| `robz` | `claude mcp add arsenal-robz -- node <path>/tools/mcp/server.js --groups robz` |

Pick sets that do not share a group, for the same reason as above. Settings go in as before, with `--env` before the server name; write tools need `ARSENAL_WRITE_ROOTS` on the server that holds them.

Claude Desktop takes the same thing as one entry per server in `claude_desktop_config.json`, with the groups as two more `args`:

```json
{
  "mcpServers": {
    "arsenal-units": {
      "command": "node",
      "args": ["<repo folder>\\tools\\mcp\\server.js", "--groups", "units,weapons"],
      "env": { "ARSENAL_WRITE_ROOTS": "D:\\my-mods" }
    },
    "arsenal-playing": {
      "command": "node",
      "args": ["<repo folder>\\tools\\mcp\\server.js", "--groups", "play,coach,run"]
    }
  }
}
```

A group name that no tool has is not an error: the server says so in its log and serves the rest. When Claude calls a tool whose group is off, the answer names the `--groups` line that loads it. `node <path>/tools/mcp/server.js --list --groups units` prints what a line would serve, each tool with its group; [CATALOG.md](CATALOG.md) lists every tool by group.

## Settings (environment variables)

| Variable | What it does | When it is not set |
|---|---|---|
| `ARSENAL_GAME` | The game a tool works on when the call names none: `as64`, `mowas2` or `goh`. | `as64` |
| `ARSENAL_AS2_DIR` | The Assault Squad 2 install folder. AS64 and MoW:AS2 share it. | The folder chosen in the ARSENAL window, else found through Steam. |
| `ARSENAL_GOH_DIR` | The Gates of Hell install folder. | The folder chosen in the ARSENAL window, else found through Steam. |
| `ARSENAL_WRITE_ROOTS` | Folders the write tools may change, with `;` between them. | No tool writes anything. |
| `ARSENAL_ALLOW_LAUNCH` | `1` lets the launch tools start the game, drive its menus and switch the enabled mods. | Those tools are refused. |
| `ARSENAL_MCP_GROUPS` | The tool groups `arsenal` serves, with `,` between them; the same as `--groups` (which wins). See "Load only what you need". | Every group. |
| `ARSENAL_GUI_PORT` | The port of the ARSENAL window, for `arsenal-gui`. | Found from the window's own port file, else 47811. |
| `ARSENAL_TMP` | Folder for scratch files and caches of the tools (unit lists, extracted texts, screenshots). | The system temp folder. |

In Claude Code they go in the `env` block of `.mcp.json` or after `--env`. In Claude Desktop they go in the `env` block of the config file. A server reads them when it starts, so restart it after a change (`/mcp` in Claude Code, reopen Claude Desktop).

Ask Claude to call `mow_tools` to see what is on: it says whether writes and launches are allowed, which game is the default, and names any tool module that failed to load.

## Allowing writes

Out of the box every tool only reads. A write tool then answers a preview: what it would change, and nothing is changed.

To let Claude change files:

1. Set `ARSENAL_WRITE_ROOTS` to the folder that holds your own mods, for example `D:\my-mods`, or to one mod folder. More than one: `D:\my-mods;E:\work\patch`.
2. Restart the server.
3. Claude must still pass `write: true` on the call. Without it the answer stays a preview.

What stays refused whatever you set: the game's own `resource` and `packages` folders, the rest of the game install outside `mods`, anything outside the folders you listed, and this repo. No tool deletes files. A mod inside `<game>\mods` can be written only when you list that mod folder (or `mods`) yourself.

## Allowing launches

Set `ARSENAL_ALLOW_LAUNCH=1` and restart the server. Then Claude can start a test match, drive the menus, take a screenshot and switch which mods are enabled. Leave it unset if you do not want the game started for you. Any other value than `1` counts as off. With it off Claude can still ask a launch tool for a dry run (`dry: true`): the answer says what would be started, and nothing is started.

## Using the skills in another project

The skills are plain folders. Copy the ones you want (or all of `.claude/skills`) into the other project's `.claude/skills` folder, or into `~/.claude/skills` to have them everywhere:

```
xcopy /E /I <repo folder>\.claude\skills D:\other-project\.claude\skills
```

Each skill names the MCP tool first and the command line second. In another project the command lines need the full path to this repo's `tools` folder, so register the `arsenal` server there too (see "Claude Code, from another folder"); then the skills work through the server and need no paths.

## Checking that it works

```
sh tools/mcp/test/run.sh
```

It starts the server, lists the tools, calls each knowledge tool on the repo's own data, checks that writes and launches are refused when not allowed, and checks that CATALOG.md is current. After adding or changing a tool or a skill, run `node tools/mcp/catalog.js` to write CATALOG.md again.

By hand, one request per line on standard input:

```
echo {"jsonrpc":"2.0","id":1,"method":"tools/list"} | node tools/mcp/server.js
```

## If something is wrong

- The server is not listed: check that `node --version` works in the same terminal, and that the path in the config is the full path.
- A tool is missing: call `mow_tools`. A module that failed to load is named there with the reason; the other tools keep working. A group that is off is named there too, with the line that turns it on.
- "writing is off" or "outside the folders that may be written": see "Allowing writes".
- "starting or driving the game is off": see "Allowing launches".
- The game folder is not found: set `ARSENAL_AS2_DIR` or `ARSENAL_GOH_DIR`, or choose the folder once in the ARSENAL window.
- `arsenal-gui` answers that the window is not running: start it with `node tools/gui/gui.js`.
