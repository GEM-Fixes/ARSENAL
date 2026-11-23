# Building ARSENAL

How this tree becomes something you can run or hand to someone else. Everything runs on your own computer; nothing is
uploaded. The full build guide, with every option, is `tools/dist/README.md`.

## What you need

| For | You need |
|---|---|
| running the tools and the window | Node.js 18 or newer (the tools are tested on Node.js 26) |
| building the download package | Node.js; Microsoft Edge or Chrome for the guide as PDF (or add `--no-pdf`) |
| building the installers | the above and the Go toolchain (`go` on PATH, or `ARSENAL_GO=<full path to go>`) |

There is no install step and no dependency to download: the tools use only what comes with Node.js, the installer only
Go's standard library.

## Run it from the tree

```
node tools/gui/gui.js            the ARSENAL window; open the address it prints
node tools/as2/as2.js help       the list of command-line tools
```

## Build it

| You want | Run (Windows) | You get |
|---|---|---|
| the package: window, tools, launchers, guide | `tools\dist\Build-Package.cmd` | `ARSENAL-<ver>-small.zip` |
| the installers, tools and window only | `tools\dist\Build-Installer.cmd plain` | six `ARSENAL-Setup-<ver>-<system>` files |
| the installers with the data folders | `tools\dist\Build-Installer.cmd` | the same six files, larger |

Output goes to `<this folder>\..\run\package` and `<this folder>\..\run\installer`. The six systems are Windows, Linux and
macOS, each for x64 and arm64; one build machine makes all six.

On Linux or macOS, or by hand:

```
node guide/build-pdf.js --public --out <work>/public/guide/dist
node tools/dist/zip.js --small --out-dir <out> --books-root <work>/public --no-gemindex --no-ww2sources --no-workshop_gui
node tools/installer/build.js --payload <out>/ARSENAL-<ver>-small.zip --out <installers> --work <work>/installer
```

## How the build is put together

1. **Guide book.** `guide/build-pdf.js` turns the guide pages into one HTML file and one PDF.
2. **Release gate.** `tools/dist/zip.js` checks the tree before it writes anything: no user folder paths, names or e-mail
   addresses, no game art or game data, an author line in every tool source file. One failed check and no zip is written;
   each failure is a line that starts with `REFUSED`.
3. **Package.** The same program packs `tools/`, the launchers (`ARSENAL.cmd`, `ARSENAL.sh`, `ARSENAL-gui.cmd`), the
   guide and the licence files into the zip and writes its sha256 beside it.
4. **Installers.** `tools/installer/build.js` puts the package inside a small Go program and builds it for the six systems.
5. **Node.js is never inside.** The package's launcher fetches the pinned Node.js from nodejs.org on first start and checks
   its sha256; the installer sets Node.js up from nodejs.org the same way. The pins are in
   `tools/dist/launch/node-pin.json` and `tools/installer/config.json`.
6. **The historical sources.** This tree carries them in `ww2sources/`: the source list, the word lists and the text of the
   documents as a database cut into pieces (334 MB). The window puts the pieces together the first time Historical sources is
   opened (`node tools/gemindex/gemindex.js ww2-join` does the same). The small package and the plain installers leave the
   database out; the installer then offers it as a download. `tools/dist/README.md` section 5 says how to set that link.

## Test it

```
sh tools/<tool>/test/run.sh         one tool's tests
sh tools/gui/test/run.sh            the window
sh tools/installer/test/run.sh      builds this system's installer and runs it into a scratch folder
sh tools/test-all.sh                everything (long)
```

On Windows the `sh` commands need Git Bash or another POSIX shell. A new tool source file needs the author line the gate
asks for: `Author: <name> (ARSENAL, ia-<8 hex digits>)` in its first comment block.

## Not yet proven

The Linux and macOS installers have been built but never run, and the build has only been run on a Windows machine.
The files are not signed, so Windows and macOS warn on first start.
