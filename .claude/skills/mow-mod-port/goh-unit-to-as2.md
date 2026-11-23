# mow-mod-port: one GoH unit into AS2 / as64 (plan and convert)

when: "port this Gates of Hell tank / gun / soldier into Assault Squad 2", first step of any GoH unit port.
G = AS2 install, H = GoH install, `<out>` = result mod folder (outside both installs).

## Steps
1. plan: MCP `mow_port_plan {game:"as64", mod:"<GoH mod or H>", from:"goh"}` (what converts, what drops, what blocks) · facts that differ: `mow_game_diff {game:"as64", other:"goh"}`
2. dry run of the converter:
   `node tools/goh2as2/goh2as2.js --goh <GoH dir> (--entity <name>|--keys file) --out <dir> [--game as2dir] [--nation n] --dry-run [--no-deps] [--deps] [--max-files N] [--text-only] [--entity-list F] [--no-keylint] [--format F] [-o file] [-q] [--exe as64|mowas_2|mowas2]`
   `--text-only` writes text and no binary (a static look); every code it prints is WARN_ [I]
3. pick the route:
   (a) converted GoH def: fast, many GoH-only keys to drop
   (b) donor: a vanilla AS2 def of the same class carrying the GoH model → `donor-route.md` (the route that reached working units most often)
4. convert for real: the line of step 2 without `--dry-run`
5. repair + lint + verdict → `repair-and-lint.md`; names: `node tools/goh2as2/unitname.js <mod dir> [--goh H] [--game G] [--dry-run] [--list]`
6. buy card for it → skill `mow-mod-units`; GoH cards priced in `dp` become AS2 hero cards: `node tools/cards/cards.js --out <dir> --units a,b`
7. test: spawn, drive, fire, take a hit (→ skill `mow-mod-test`)
- GUI: GoH game tab > Units > `goh` page (1. Pick the GoH unit, 2. Pick the donor, 3. Convert; routes `goh/units`, `goh/donors`, `goh/convert`, `goh/fit`)

## Per game
- as64 target: mod.info MinGameVersion 3.301, the vanilla view includes `as64/core`
- mowas2 target [I]: `--exe mowas_2`, no `as64/core`, donor pool of MoW:AS2 only; no ported unit has been loaded in mowas_2.exe yet
- goh as target: refused here → `as2-mod-to-goh.md`

## Silently fails / crashes
- PORT-53 GoH entity keys with no AS2 reader are fatal "unexpected token"; often inside a define, so the log names the macro, not the file
- PORT-18 GoH `perks{component{health..}}` has no AS2 key: the whole block must go, a leftover shell is itself fatal
- PORT-02 GoH overmatch / slope tables are not in the AS2 engine: values must be baked, not copied
- PORT-13 crew seats are bound to the model and animations: the seat count can not be changed in the def alone
- FMT-02 GoH ships BC5 (`ATI2`) normal maps as64 can not read: texture missing unless converted (texcheck / texconv)
- LOG-07 a stuff name the target lacks becomes `dummy_checker`: fine at load, crash on use
- HUM-39 GoH weapon ability keys `recoil`, `zoom_recoil`, `sway` are inert in as64 (dropped)

## Verify
- static: `node tools/portverdict/portverdict.js <mod dir> --game G [--goh H]`; in game: the four points of skill `mow-mod-test` (`verified.md`). Report both, apart
