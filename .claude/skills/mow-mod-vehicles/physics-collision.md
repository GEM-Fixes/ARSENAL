# mow-mod-vehicles: collisions, crushing, tipping, rigid-body physics

when: "tank drives through trees / walls", "can my tank crush cars", "vehicle is pushed around", "light tank stops at a fence", "tips over", "flies away after a hit", "Simulating entity without volumes".
G = game install, `<mod>` = the user's mod folder (full path). MCP `game` = `as64|mowas2|goh`.

## Steps
1. the unit's groups: MCP `mow_entity_info {names:["<entity>"], mod:"<mod>"}` (`collider`, `obstacleID`, `PatherID`, simulation keys)
2. the tables that win: MCP `mow_file_which {path:"set/colliders.set", mods:[..]}` and `{path:"set/registry/obstacles.reg", mods:[..]}`, then Read the unit's rows
3. rules: MCP `mow_lookup {query:"movement/colliders", mode:"topic"}`; `{query:"movement/obstacles", mode:"topic"}`; `{query:"movement/collision", mode:"topic"}`
4. what a contact DOES (trees break, fences fall, ram damage) is script: MCP `mow_script_find {name:"contact", q:"<class>"}` → skill `mow-mod-scripts`
5. change: a mod copy of the table (replaces the whole file) or point the unit at another existing profile: MCP `mow_mod_gen {mod:"<mod>", ops:[{op:"set", rows:["<entity>,collider,<name>"]}]}` (plan)
6. lint: `node tools/keylint/keylint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh]` (COLLIDER_IDS_MAX)

## Mechanics [V unless tagged]
- three separate tables: `colliders.set` (who physically touches whom), `obstacles.reg` (what route planning pays to cross each obstacle kind, per pather), `pather.set` (terrain cost)
- collider profile: `colliderId` (group), `collideWith`, `noContactWith`, `noContactsAtAll`, `blocking {speed}{penetration}`, `canPush`, `canPushBroken`, `useRamVolume`; inherited with `from`
- obstacle cost: -1 impassable, 0 free, positive = the planner may drive through and break it (a flat price per crossing)
- a slow contact stops the unit (`blocking`); a faster one starts rigid-body simulation and the lighter object is thrown
- pushing mass slows the vehicle; crushing slows it briefly [I]
- soldiers never take contact pushes; running a man over is overlap and contact events in scripts [T]
- rigid body: a vehicle past `FallSlope`, cut-off turrets, thrown parts; rests after it stops moving; needs volumes with mass

## Per game
- as64 / mowas2: as above
- goh: physics work and vehicle part damage are host-owned and sent to clients (GHNET-93); `linear_damping` action exists (GHINT-26).

## Silently fails
- KEY-22 an unknown `collider` name: warning and the DEFAULT profile (the unit collides like something else)
- KEY-08 / MOV-26 more than 32 collider groups are not supported
- MOV-25 blocking stops only slow contacts with little overlap; a fast vehicle ploughs through
- MOV-27 `noContactsAtAll` (vanilla human): never pushed
- MOV-28 0.5 s forced rest after a stop: an impulse inside it is ignored
- MOV-29 `Simulating entity without volumes`: the body has no mass volumes
- MOV-15 a cheap obstacle cost makes units drive through things rather than around
- MOV-22 over 70 degrees tilt the vehicle can not be crewed or driven until righted
- obstacle and collider tables are whole-file copies: two mods changing them clash → skill `mow-mod-together`

## Verify
- in game drive the vehicle by order and in direct control into a tree, a fence, a wall, a light car and a heavier tank; watch route choice (around or through); log read (→ skill `mow-mod-test`)
