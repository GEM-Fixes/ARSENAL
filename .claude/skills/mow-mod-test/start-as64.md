# mow-mod-test: start a match on as64

when: "run my mod", "start a test match", "host this map with bots" on the 64-bit build. Launch kind: needs `ARSENAL_ALLOW_LAUNCH=1` and the user's yes; `dry` needs neither.
G = AS2 install, `<mod>` = mod folder.

## Steps
1. dry: MCP `mow_game_start {game:"as64", map:"2v2_farmstead", mode:"battle_zones", players:4, mods:["<modname>"], dry:true}` → the command line and the steps
2. start: the same without `dry` (`hold:120` keeps the match that many seconds, default 60; `wait_over:true` runs until the match ends)
   CLI `node tools/testrun/testrun.js --map <map|multi/map:mode> [--exe exe] [--players n] [--mods a,b] [--hold s | --wait-over]`; `--dry` prints the plan, `--probe` checks the control pipe; a scripted row: `--scenario f.json [--param k=v]`
3. the whole loop in one line: `node tools/as2/as2.js e2e <mod> --map m` (modinfo, build, install, modswitch --set, testrun, logtriage --mod, modswitch --restore)
4. a second copy beside the user's game: `-instance 1..9` (own pipe `as64.<N>`, own port, own user dir `... - instance N`, own log and profile; TST-22)
5. then: exercise the change (`prove-a-change.md`), read the log (`read-the-log.md`)
- GUI: Share tab > `test` (Test Run) and `play` pages; commands `run play` (`dry` first), `run e2e`, `run probe` are launch routes (refused unless the window allows launches)

## Facts
- the control pipe is served only when as64.exe was started with `-control` (TST-17); max 4 clients (TST-18)
- MP map id = `multi/<map>:<mode>`; a scripted MP start retries until ready (TST-24)
- stage-changing pipe commands answer ok while the stage is still `starting`: the next command is valid ~280 ms later, when `active` (TST-21)

## Per game
- as64 only. mowas2 / goh → `start-mowas2-goh.md` (testrun live refuses them, exit 2)

## Silently fails
- TST-32 testrun without `--exe` only prints plans (status 0): compare the log time before trusting a result
- TST-22 fresh instance profile = empty mod list: the test passes on vanilla
- TST-03 the vanilla LAN Combat card has no bots; MIS-61 bots on a 1v1 lobby end the match in ~17 s; MIS-65 no flag points = idle bots: use a flag mode with 4 slots
- TST-26 a team with no units loses after a 30 s grace: the match is over before the test
- TST-34 players are capped by `map.info` `maxPlayers` and need map points
- TST-23 `pipe_events all` is slow while the game loads (~10 s): pipe timeouts of 30 s or more
- TST-16 no quit over the pipe: testrun sends `quit`, then ends its own process after 20 s; never end a game the user started
- NET-22 nothing buys for a human slot by pipe: a person buys, or bots do

## Verify
- the run reached a live match (clock running), the mod was active (`mod_list applied:true`); then the four points of `verified.md`
