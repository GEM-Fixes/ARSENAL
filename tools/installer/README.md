# ARSENAL Setup (tools/installer)

One installer file per system: Windows, Linux, macOS, each for x64 and arm64. It needs nothing on the user's computer:
no Node.js, no runtime, no unpacker. Windows is the only system it has been run on; Linux and macOS are built and
checked by the compiler only [T].

## What it does

1. Unpacks the small ARSENAL package it carries into a per-user program folder.
   - Windows `%LOCALAPPDATA%\Programs\ARSENAL`
   - Linux `~/.local/share/arsenal-toolkit` (+ `~/.local/bin/arsenal`)
   - macOS `~/Library/Application Support/ARSENAL-Toolkit` (+ `~/Applications/ARSENAL.app`)
2. Sets Node.js up for the whole computer when no Node.js of the wanted version is found: the official installer from
   nodejs.org, checked against a pinned sha256 (Windows .msi, macOS .pkg, Linux tar.gz into `/usr/local`). The system
   asks for the administrator's yes. Declined or failed: the ARSENAL launcher fetches its own pinned copy on first start.
3. Runs the installed toolkit once (`version`, `game`) and reports what it found: browser, caches, game.
4. Makes the Start menu / applications entry, the Desktop icon, and (if ticked) the start at sign-in.
5. Downloads the historical index when ticked and a link is set.
6. Starts ARSENAL when ticked.

Tick boxes on the setup page: Desktop icon (on), Start ARSENAL when the install finishes (on), Start ARSENAL when I
sign in (off), Download the historical index (off; greyed out while no link is set).

The page is served on 127.0.0.1 only, on a random port with a random token, and opens in the default web browser.
Without a browser: `--console` (asks in the terminal) and `--yes` (asks nothing). `--help` lists every option.
Uninstall: the Windows "Installed apps" entry, or `ARSENAL-Setup --uninstall` in the install folder. It removes only
what the record file `ARSENAL-install.txt` lists; files the user added stay, Node.js stays.

## What is not inside

- Node.js. `build.js` refuses a payload that carries `node`, `node.exe` or `ARSENAL.exe`.
- The historical index. `build.js` refuses a payload with, and a `-ww2` zip by name.

## The historical index link

Put the link, sha256 and size into `config.json` (`historical.url`, `.sha256`, `.bytes`) and build again, or pass
`--historical-url/-sha256/-bytes` to `build.js`. The link must be https and point at `index.sqlite` or a zip that holds
it. `node tools/installer/build.js --describe <file>` prints the sha256 and size of the file to upload; the one-click
build prints them at its end. An installed copy can also be given the link later:
`ARSENAL-Setup --historical --historical-url <link>`.

## Build

One click: `tools\dist\Build-Installer.cmd` (data folders, guide book, small package, six installers). Add the word `plain` to
build without the data folders. Every step, the package alone and the historical index: `tools/dist/README.md`.
By hand: `node tools/installer/build.js [--payload ARSENAL-<ver>-small.zip] [--out dir] [--only windows-x64,...]`.

The build machine needs Node.js and the Go toolchain (`ARSENAL_GO=<path to go>`, else `go` on PATH); Go's standard
library only, no modules are downloaded. Output: `ARSENAL-Setup-<ver>-<system>[.exe]` and a `.sha256` beside each.
When Node.js is re-pinned (`tools/dist/launch/node-pin.json`), update the three `nodeInstallers` rows in `config.json`
from that version's `SHASUMS256.txt`; the build stops when the versions differ.

## Files

- `build.js` builder; `icon.js` draws the icon; `config.json` Node.js installers and the historical link
- `src/main.go` steps, record, uninstall, options; `src/ui.go` + `src/page.html` the setup page
- `src/plat_windows.go`, `plat_linux.go`, `plat_darwin.go`, `plat_unix.go` what differs per system
- `test/run.sh` build.js checks + this system's installer run into scratch (install, reinstall, uninstall)

Test hooks (tests only): `ARSENAL_SETUP_TEST_ROOT` sends shortcuts and registry writes under a scratch folder,
`ARSENAL_SETUP_NO_BROWSER` prints the page address instead of opening it, `ARSENAL_SETUP_NODE_PREFIX` (Linux) is the
Node.js folder without root.

## Known gaps

- Linux and macOS installers have never been run [T]. The Node.js system-wide step has never been run on any system [T].
- The files are not signed: Windows SmartScreen and macOS Gatekeeper warn on first start.
- The Windows file has no icon or version resource of its own (the shortcuts do have the icon).
- After a Windows uninstall a small copy of the installer stays in `%TEMP%`.
