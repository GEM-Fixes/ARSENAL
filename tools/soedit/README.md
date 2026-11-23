# tools/soedit: SOEdit inside ARSENAL

SOEdit itself is not part of ARSENAL and is not in this repository (https://github.com/ThatFrostyy/SOEdit-PatchByFrostyy); `install` downloads its latest release. This folder is the node side.

## Command line (fixed 2026-11-10; the Models tab calls exactly this)

```
node tools/soedit/soedit.js locate [--json]
node tools/soedit/soedit.js build  [--config Release] [--dry]
node tools/soedit/soedit.js stage  <entity name | path to .mdl> --out <mod folder> [--game G] [--mods a,b] [--anm a,b | --no-anm] [--dry] [--json f]
node tools/soedit/soedit.js open   <staged .mdl | stage record> [--anm file] [--lang en|ru|uk|zh] [--wait] [--dry]
node tools/soedit/soedit.js check  <stage record | staged .mdl> [--game G] [--json f]
node tools/soedit/soedit.js ops    <operation> ...            (wave 2, tools/soedit/ops/)
```

- `locate`: where SOEdit.exe is. Order: `ARSENAL_SOEDIT` environment variable, a `soedit` folder next to the running
  ARSENAL exe, `tools/dist/out/soedit/` (a copy put there by hand), the copy `install` downloaded, then the user's own folders. Prints the path, the source of the answer and the exe hash.
  Exit 2 with a plain sentence when none is found.
- `install`: downloads the newest published release of the GitHub repository named in `soedit-pin.json` (size and, when GitHub
  lists one, checksum checked), unpacks it into the user's ARSENAL folder. The package pinned in the same file is taken when
  GitHub cannot be asked. `build` is gone: SOEdit's source is not in this repository.
- `stage`: finds the model through `tools/lib/vfs.js` (loose files and paks, mods over game), collects its file set (the
  `.mdl`, every `.ply`, `.vol`, `.mtl` and texture it names, the `.anm` files of its sequences), copies them to the same
  relative paths under the mod folder. Files already in the mod folder are kept, never overwritten. Writes a stage
  record (JSON: every file, where it came from, size and sha256 at staging time). Refuses a target inside a game
  install (`tools/lib/writeguard.js`).
- `open`: starts SOEdit.exe on the staged model with `--respath` and `--lang` (only a build that knows them gets these options).
  Detached unless `--wait`.
- `check`: compares the staged files now against the record. Reports per file: unchanged, changed, new. For changed
  files it names what was lost (UPPER_SNAKE codes through `tools/lib/report.js`): animation version changed, `SUBM` parts
  turned into `MESH`, keywords present before and missing after in the `.mdl` (per bone, volume, sequence), top-level
  blocks missing, comment lines dropped. Then runs `binhdr` and `expcheck` on the changed files.

## Files and owners

| Path | What | Owner |
|---|---|---|
| `soedit.js`, `locate.js`, `build.js`, `stage.js`, `check.js`, `test/**`, `REPORT.json` | the tool | wave 1 launcher session |
| `parity.md`, `ops/NOTES.md` | every SOEdit function with its source line; how each batch operation works | wave 1 parity session |
| `ops/*.js` | batch operations without a window | wave 2 |
| `README.md` | this contract | coordinator |
