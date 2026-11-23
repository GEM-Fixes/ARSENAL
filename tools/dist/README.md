# Building ARSENAL (tools/dist, tools/installer)

How to turn this tree into something a user can download: the package (the window, the tools, the launchers, the guide
book) and ARSENAL Setup, the installer for six systems. Everything here runs on your own computer. Nothing is uploaded.

| You want | Run | You get |
|---|---|---|
| only the package, no installer | `tools\dist\Build-Package.cmd` | `ARSENAL-<ver>-small.zip` |
| the installers, with the data folders | `tools\dist\Build-Installer.cmd` | six `ARSENAL-Setup-<ver>-<system>` files |
| the installers, tools and window only | `tools\dist\Build-Installer.cmd plain` | the same six files, smaller |

## 1. What the build machine needs

- Node.js on PATH, version 26 (the one the tools are tested on). Every builder is a Node.js program.
- For the installers only: the Go toolchain. `go` on PATH, or `ARSENAL_GO=<full path to go>`. Only Go's standard library
  is used; no module is downloaded.
- For the guide book as PDF: Microsoft Edge or Chrome. Without one, add `--no-pdf` and the book ships as HTML only.
- The two `.cmd` files are for a Windows build machine. On Linux or macOS run the commands of section 6 by hand; they are
  the same Node.js programs [T: built on Windows only so far].

The user's computer needs none of this. The package brings a launcher that fetches Node.js; the installer sets Node.js up.

## 2. The parts

| Part | Made by | What it is |
|---|---|---|
| package | `node tools/dist/zip.js --small` | `ARSENAL-<ver>-small.zip`: `tools/` (the window is `tools/gui`), `ARSENAL.cmd`, `ARSENAL.sh`, `ARSENAL-gui.cmd`, `Install-ARSENAL.cmd`, `START-HERE.md`, licence files, the guide pages and book, samples |
| guide book | `node guide/build-pdf.js --public` | the guide as one HTML file and one PDF |
| guide index | `node tools/gemindex/gemindex.js bundle` | folder `gemindex`: the list of community guides and tools the Docs page searches |
| historical sources | `node tools/gemindex/gemindex.js ww2bundle` | folder `ww2sources`: the source list, word lists and the historical index `index.sqlite` |
| installers | `node tools/installer/build.js` | `ARSENAL-Setup-<ver>-<system>[.exe]` for windows-x64, windows-arm64, linux-x64, linux-arm64, macos-x64, macos-arm64, each with a `.sha256` file |

Two things are never inside a package or an installer, and the builders refuse to put them in:

- **Node.js.** The package's launcher downloads the pinned Node.js from nodejs.org on first start and checks its sha256.
  The installer sets Node.js up for the whole computer from nodejs.org, also against a pinned sha256, and falls back to
  the launcher's own copy when the user says no.
- **The historical index** (`index.sqlite`, large). The installer downloads it from a link when the user ticks the box.
  Section 5 says how to set the link.

## 3. Only the package (the window and the tools)

One click: `tools\dist\Build-Package.cmd`. Output: `<checkout>\..\run\package\ARSENAL-<ver>-small.zip` and its `.sha256`.

By hand:

```
node guide/build-pdf.js --public --out <work>/public/guide/dist
node tools/dist/zip.js --small --out-dir <out> --books-root <work>/public --no-gemindex --no-ww2sources --no-workshop_gui
```

- `--ver 0.2.0` sets the version in the file name and the top folder.
- `--check` runs the release gate only and writes no zip.
- Leave out `--no-gemindex` / `--no-ww2sources` and give `--gemindex <folder>` / `--ww2sources <folder>` to put the data
  folders in (section 5). `--no-workshop_gui` leaves out the Workshop uploader program, a separate download that is not
  part of this tree.
- The user unzips it anywhere and starts `ARSENAL.cmd` (Windows) or `ARSENAL.sh`; `ARSENAL-gui.cmd` opens the window.
  `Install-ARSENAL.cmd` in the zip is a small Windows installer for people who do not want ARSENAL Setup.

Run from the tree without packing anything: `node tools/gui/gui.js` opens the window, `node tools/as2/as2.js help` lists
the tools.

## 4. The installers

One click: `tools\dist\Build-Installer.cmd` (needs the data folders of section 5) or `tools\dist\Build-Installer.cmd plain`
(needs nothing but Node.js and Go). Output: `<checkout>\..\run\installer`, six installers and their `.sha256` files.

By hand, from a package you already built:

```
node tools/installer/build.js --payload <out>/ARSENAL-<ver>-small.zip --out <installers> --work <work>/installer
```

- `--only windows-x64,linux-x64` builds some of the six. Go builds all six from any one build machine.
- Without `--payload` the builder makes the package itself; options after `--` go to `zip.js`.
- What an installer does on the user's computer, its tick boxes, uninstall and known gaps: `tools/installer/README.md`.

### Node.js on the user's computer

Two files hold the pinned Node.js version and the sha256 of every download:

- `tools/dist/launch/node-pin.json`: what the package's launcher fetches (zip or tar.gz, six systems).
- `tools/installer/config.json`, `nodeInstallers`: what the installer runs (Windows `.msi`, macOS `.pkg`; Linux uses the
  tar.gz of the first file).

To move to another Node.js version, change both from that version's `SHASUMS256.txt` on nodejs.org. The two versions
must be equal; the installer build stops when they differ.

## 5. The data folders and the historical index

Both folders are built from collections that are not part of this tree. Without them everything else works; the Docs
page then has no community index and no historical sources.

- Guide index: `node tools/gemindex/gemindex.js bundle --from <GEM External Index toolkit folder> --out <work>/gemindex`
- Historical sources: `node tools/gemindex/gemindex.js ww2bundle --from <WW2 sources folder> --out <work>/ww2sources`

`Build-Installer.cmd` runs both. Set `ARSENAL_WW2_FROM` and `ARSENAL_GEM_FROM` to the two collections first; the folders
are reused on the next run, the word `fresh` rebuilds them. `ARSENAL_DIST_WORK` is where they are built,
`ARSENAL_DIST_OUT` where the installers go.

The historical index is offered to the user as a download:

1. Build the installers once. The last lines print the file to upload (`<work>/`), its sha256
   its size. The same for any file: `node tools/installer/build.js --describe <file>`.
2. Upload that file somewhere it can be fetched over https, as `index.sqlite` or as a zip that holds it.
3. Put the link, the sha256 and the size into `tools/installer/config.json` (`historical.url`, `.sha256`, `.bytes`), or
   pass `--historical-url`, `--historical-sha256`, `--historical-bytes` to `build.js`.
4. Build again. The tick box "Download the historical index" is now live; while no link is set it is greyed out.

An installed copy can be given the link later: `ARSENAL-Setup --historical --historical-url <link>`.

For git hosts with a file size limit, `gemindex.js ww2-split` cuts `index.sqlite` into pieces and `ww2-join` puts them
back together and checks them.

## 6. The whole run by hand (any build machine)

```
node tools/gemindex/gemindex.js bundle    --from <GEM toolkit folder> --out <work>/gemindex      (optional)
node tools/gemindex/gemindex.js ww2bundle --from <WW2 sources folder> --out <work>/ww2sources    (optional)
node guide/build-pdf.js --public --out <work>/public/guide/dist
node tools/installer/build.js --out <installers> --work <work>/installer -- --gemindex <work>/gemindex --ww2sources <work>/ww2sources --books-root <work>/public
node tools/installer/build.js --describe <work>/
```

Without the optional folders use `--no-gemindex --no-ww2sources` in their place, and add `--no-workshop_gui` where the
Workshop uploader folder is absent.

## 7. The release gate

`zip.js` checks everything before it writes a zip, and writes none when a check fails. Each failure is one line that
starts with `REFUSED`:

- a user folder path, a user name or an e-mail address in a file;
- game art or game data files in the package;
- a guide page that names something a modder never sees. Names a modder does meet are listed in
  `tools/docgen/public-allow.txt`, with the place where they meet it;
- a tool source file without its author line. Every `.js`, `.cmd` and `.sh` under `tools/` carries one line of the form
  `Author: <name> (ARSENAL, ia-<8 hex digits>)` in its first comment block; give a new file the same line;
- the historical index or Node.js inside a package for the installer.

Lines that start with `WARN` do not stop the build.

## 8. Tests

- `sh tools/installer/test/run.sh`: the builder's checks, then this system's installer is built and run into a scratch
  folder (install, install again, uninstall). Without Go the run part is skipped and says so.
- `sh tools/dist/test/run.sh`: the package builder and the launchers. It needs the Workshop uploader folder, so in a
  tree without it this suite cannot pass.
- `tools/dist/ci/test.yml`: a workflow for a build service that builds the package on Windows, Linux and macOS and runs
  the first start with and without Node.js present. It is not active until it is copied to where the service reads it.

## 9. Not yet proven [T]

- The Linux and macOS installers have been built, never run. The step that sets Node.js up for the whole computer has
  not been run on any system.
- The files are not signed: Windows and macOS warn on first start.
- `tools/dist/sea.js` builds one program file with Node.js inside (`ARSENAL.exe`). It still works, but it is no longer
  the release form: the package and the installers above are.
