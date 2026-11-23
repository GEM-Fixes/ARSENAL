# Chapter 7: Units, Vehicles and Movement

This chapter explains how a vehicle moves in Men of War: Assault Squad 2, and which numbers you change to make it faster, slower, heavier on the road or stuck in mud. Terms such as locomotion, pather and collider are explained as they come up, and the [glossary](22-glossary.md) lists them all.

If you only want to change a unit's top speed or price, the short way is on [Change a unit's numbers](p02-change-unit-numbers.md), and a new unit made from an existing one is on [Add a new unit](p03-add-a-unit.md). Every key named here has a full entry in [Reference 4: Chassis, movement, wheels and tracks](r04-chassis-and-movement.md).

## What you will learn

- Which units the data uses for length, speed, angle and time.
- The main vehicle keys and the `Locomotion` block.
- How the chassis types differ: foot, wheel, track, railway, water, airborne, torpedo and human carrier.
- How terrain changes speed, and how pathfinding profiles and obstacles work.
- What orders can and cannot do, and how collisions behave.
- How to tune a vehicle in the ARSENAL window or by hand, and check it.

Work in your own mod folder, never in the game folder. Text files use CRLF line endings; the 64-bit build reads every string value as UTF-8, in data files and `.lng` files alike, and identifiers must be plain ASCII. Original data is ASCII outside `;` comments, where some old cp1251 bytes remain; leave them as they are. Paks are zip files. Editors may silently change encoding or line endings on save.

## 1. Units and scale

Inside the game, one length unit is a twentieth of a metre (0.05 m). You rarely see this, because most SDL keys use human units:

| Quantity | Unit in SDL |
|---|---|
| Length | metres |
| Vehicle speed | kilometres per hour |
| Angle | degrees (turn rates in degrees per second) |
| Time | seconds |
| Armour thickness and penetration | millimetres |

A few keys and console values do use the inner unit of 0.05 m (20 units to a metre); their reference entries say so. A few other things are worth keeping in your head. The vehicle pathfinding grid has cells of 1.6 m, so no vehicle path is planned more finely than that. Soldiers plan on a coarser network of open areas instead (10 m cells split into free regions). The terrain height map has cells of 0.5 m.

### In Gates of Hell

<!-- goh: GHMOV-06 -->

The units are the same. The vehicle pathfinding grid is finer: cells of 0.8 m instead of 1.6 m, so vehicles find gaps half as wide (section 5).

## 2. Vehicle keys and the `Locomotion` block

A vehicle gets most of its movement behaviour from the class file it includes, such as `properties/tank.ext` or `properties/car.ext`. The class file names the chassis type and defines a macro called `locomotion` with the class defaults. The unit's own `.def` file then adds a `{Chassis}` block without a type word and calls the macro, overriding only what differs. This is the pattern of a vanilla heavy tank:

```
{Chassis
  ("tank_trace" fx("tracks_big") step(0.47) len(0.183))
  {Locomotion ("locomotion")
    {MaxSpeed 22}
    {maxSpeedAtMaxTurn 8.5}
    {StartTime 18}
    {TurnTime 11}
    {TurnStart 1.9}
    {BrakeTime 1.5}
    {StopTime 2.5}
    {TurnRadius 10}
    {TurnStop 1}
    {Gears 0.1 0.5 1.0}
    {RearGears 0.1 0.45}}
  {speed {Normal 10} {Slow 12}}}
```

The keys that matter most:

- [`MaxSpeed`](r04-chassis-and-movement.md#maxspeed) is the top speed on flat ground, in km/h.
- [`StartTime`](r04-chassis-and-movement.md#starttime) sets acceleration: in top gear the vehicle gains `MaxSpeed / StartTime` km/h each second, and more in lower gears.
- [`BrakeTime`](r04-chassis-and-movement.md#braketime) sets active braking and [`StopTime`](r04-chassis-and-movement.md#stoptime) the coasting slowdown when nothing pushes the vehicle.
- [`TurnTime`](r04-chassis-and-movement.md#turntime) is the time for a full 360 degree turn. If you leave it out, the built-in value is one second for a full circle, which is almost instant and looks wrong for a tank. The tank class macro sets 5, so a tank that uses `("locomotion")` is covered; a vehicle written without the macro is not.
- [`TurnStart`](r04-chassis-and-movement.md#turnstart) and [`TurnStop`](r04-chassis-and-movement.md#turnstop) are how long a tracked vehicle takes to build up and lose its turn speed. They do nothing on other chassis.
- [`TurnRadius`](r04-chassis-and-movement.md#turnradius) is the radius, in metres, of the arcs the route builder puts into corners of a planned path. It is not the physical turning circle. A tracked vehicle still pivots on the spot; a wheeled vehicle's real turning circle comes from its model (the distance between two wheel bones and its largest steering angle, see section 3).
- [`MaxSpeedAtMaxTurn`](r04-chassis-and-movement.md#maxspeedatmaxturn) caps the speed at full steering lock, but only in direct control.
- [`Gears`](r04-chassis-and-movement.md#gears) is a list of up to five fractions of `MaxSpeed`, strictly rising, the last normally 1. Each gear caps speed at its fraction; lower gears accelerate faster. `0.1 0.5 1.0` means first gear tops out at a tenth of `MaxSpeed`. The numbers are not speeds in km/h. [`RearGears`](r04-chassis-and-movement.md#reargears) does the same for reverse, so `0.45` as the last value gives a top reverse speed of 0.45 of `MaxSpeed`.
- [`MaxSlope`](r04-chassis-and-movement.md#maxslope) (default 30 degrees) is the slope at which the engine no longer pulls uphill, and [`FallSlope`](r04-chassis-and-movement.md#fallslope) (default 45 degrees) is the tilt at which a moving vehicle leaves normal driving and slides or tumbles.

An unknown key inside `Locomotion` stops the load with "unexpected token" in the log, so a typo is loud. A bad gear list is not: more than five gears logs "Too many gears specified", and numbers that do not rise log "Gear ratios must have ascending order", but the vehicle still loads with the wrong list.

### Speed settings: why an ordered unit is slower

The game has three speed settings for ordered moves, called Slow, Normal and Fast, set in the [`speed`](r04-chassis-and-movement.md#speed) block of the chassis. When a `Locomotion` block closes, they are worked out as 0.45, 0.67 and 0.92 of `MaxSpeed`. A `{speed}` block written after it replaces the ones it names with fixed values in km/h; the heavy tank above sets Normal 10 and Slow 12 and keeps Fast at 0.92 of 22.

This matters more than it looks. A move order never goes faster than the speed setting it uses; only a player in direct control reaches `MaxSpeed`. So when you raise `MaxSpeed`, the ordered speed rises only for the settings that are still fractions. If the unit's own file sets fixed `Normal` and `Slow` values, as many vanilla tanks do, change those too. The game does not check that Slow is below Normal and Normal below Fast; many vanilla vehicles have Slow above Normal, and the game simply takes the first of the three that is fast enough.

Two ordering rules follow. A second `Locomotion` block in the same chassis works everything out again and resets Slow, Normal and Fast. So place any `{speed}` block after the last `Locomotion` block, or your values are thrown away.

Fuel works the same way for orders. A [`FuelBag`](r04-chassis-and-movement.md#fuelbag) block gives a tank of fuel in litres and a use rate, but fuel is used only while a player drives the vehicle directly; ordered and AI movement use none.

### In Gates of Hell

<!-- goh: GHMOV-44 GHMOV-46 GHMOV-47 GHMOV-43 GHMOV-42 GHMOV-49 GHMOV-45 GHMOV-60 -->

The same keys drive a vehicle, but several of them mean something else. Retune both ways when you port.

- **Speed settings.** `Slow`, `Normal` and `Fast` are written inside the `Locomotion` block, in km/h. A separate `{speed}` block is skipped, and there are no 0.45, 0.67 and 0.92 fractions: a vehicle from Assault Squad 2 data keeps the fixed 5, 10 and 20 km/h in Gates of Hell. The other way round, `Slow`, `Normal` or `Fast` inside `Locomotion` stops the 64-bit game with "unexpected token", so move them into a `{speed}` block when you port.
- **Direct control** does not reach `MaxSpeed` unless the player holds the run key; otherwise the top is `Fast`. A unit with a `cannon` extender (a gun) has its top speed multiplied by the share of its gun crew seats that are manned, so a gun with half its crew moves at half speed.
- **Orders** are capped by the speed setting and by the slope, and the vehicle shifts up as under direct control, so computer-driven vehicles are slower uphill than in the 64-bit game.
- **`StartTime`** is the time to reach top speed through all forward gears, not the time in top gear alone, and the coasting slowdown is not added while the engine pulls. The same `StartTime` and `BrakeTime` give other acceleration and braking than here.
- **`MaxSlope`** lowers the top speed on a slope as well as the pull, by 1 - (slope / `MaxSlope`) to the power 2 in top gear and up to 4 in first gear; the 64-bit game lowers the pull only, always with power 2. Low gears climb better in Gates of Hell.
- **No movement block** gives 25 km/h in 2 seconds and braking from 25 km/h in 0.5 seconds; such vehicles start half as fast and brake harder than here.
- `CostFactor` (in `Locomotion`) and `BoostFactor` (in the chassis) are read and ignored. The 64-bit game refuses `CostFactor` with "unexpected token", so drop both.

Under GoH, the fold Translate numbers in step 3 of ARSENAL's GoH unit page shows how a ported unit's speeds are translated ([chapter 19](19-toolchain.md#units--balance-under-goh)).

## 3. Chassis types

The [chassis type](r04-chassis-and-movement.md#chassis) decides how a unit physically gets around. There are eight: `foot` (soldiers and animals), `wheel` (cars, armoured cars, motorcycles and the ground roll of aircraft), `track` (tanks and towed guns), `railway` (trains), `water` (boats), `airborne` (aircraft in flight), `torpedo` and `human_carrier` (guns that the crew push by hand, such as mortars). In vanilla the type word is written once in the class file, for example `{Chassis "track"}` in `properties/tank_unarmed.ext`. Wheel, track, water and railway share one vehicle core, so `Locomotion` works for all four. An entity may carry two chassis and switch between them by the ground under it with [`Switch`](r04-chassis-and-movement.md#switch); a seaplane has an airborne and a water chassis.

**Wheels.** A wheeled vehicle reads bones from its model, not keys from its `.def`. It needs bones named exactly [`pivot_front` and `pivot_back`](r04-chassis-and-movement.md#pivot_front-and-pivot_back): the distance between them is the wheelbase. Bones whose names start with `wheel`, `steer` and `support` are the visible wheels, the steered parts and the ground contact points. A missing pivot bone logs the warning `no "pivot_front" & "pivot_back" bones in <unit>` and the vehicle steers wrongly; the match is exact, so `pivot_front001` does not count. The largest steering angle is the `steerMax` parameter of the model's `basis` bone (45 degrees by default), and the physical turning radius is the wheelbase divided by its tangent. Wheeled vehicles never turn on the spot, and they reject a planned route with a sharp corner, so they take wide curves where a tank would pivot.

**Tracks.** Tracked vehicles pivot in place at the rate set by `TurnTime`. A forward and a reverse route are both considered and the cheaper is taken. The `tank_trace` and `car_trace` macros only draw marks on the ground and scroll the track texture; they do not make a vehicle tracked or wheeled.

**Railway and water.** Trains follow straight lines and ignore normal route search. A boat's [`WaterLine`](r04-chassis-and-movement.md#waterline) is its draught: a spot is passable when the water is deeper than that. A boat refuses a target on dry ground and, like a wheeled vehicle, never turns in place. The ocean surface you see on some maps is visual waves only; it has no physics.

**Legged (foot) movement.** Soldiers do not use `Locomotion`. They use a speed table in the `{Chassis "foot"}` block of `properties/human.ext`, in km/h:

| Row | Speed in km/h |
|---|---|
| Sneak | 5 |
| Spot | 6 |
| Walk | 8 |
| Run Slow, Normal, Fast | 8, 15, 25 |
| Bow | 18.5 |
| Crawl Slow, Normal, Fast | 4, 5, 7 |
| Swim Slow, Normal, Fast | 2, 3, 5 |

Each row holds three numbers: the speed, the speed the animation was made for (the animation plays faster or slower in proportion) and the largest turn rate in degrees per second. A soldier whose health is below 30 percent is slowed by the [`Injured`](r04-chassis-and-movement.md#injured) factor, 0.75 in the vanilla file. The final speed is also multiplied by any speed ability or perk the soldier has and by the terrain. Because the table lives in one shared file, changing it changes every soldier at once; give one kind of soldier a different speed through its breed or abilities instead (see [chapter 8](08-infantry-and-humans.md)).

### In Gates of Hell

<!-- goh: GHMOV-51 GHMOV-38 GHMOV-39 GHMOV-40 GHMOV-34 GHMOV-24 GHMOV-27 GHMOV-22 GHMOV-32 GHMOV-33 -->

- **Helicopters** are a ninth chassis type, `helicopter`; see [Helicopters](#helicopters) in the summary.
- **Wheels.** A wheel's radius comes from the cylinder volume on its wheel bone when there is one, and only otherwise from the chassis's `WheelRadius`; each wheel stands on its own radius. The size of the wheel volumes therefore sets ride height and tilt, so check them when you port a wheeled vehicle.
- **Tracks.** Every roller follows the ground, not one, so a tank rides bumps roller by roller and the hull can sit at another height on the same model. A tank short of crew ignores the driving keys under direct control (in the 64-bit game it still moves), and a tank reversing on an order stops on the route's first point instead of running on.
- **Soldiers** do not lie down or swim in shallow water; they swim only in `water` and `deep_water`, and a soldier lying in shallow water stands up. In the 64-bit game a soldier swims there.
- **Crew.** A `Driver` seat group may end with `minworkers N`: the vehicle drives once N driver seats are filled.
- **Aircraft.** `MaxAirborneAltitude` (metres, 50 by default) caps how high a player can fly each aircraft, where the 64-bit game has one console setting for all aircraft. `IgnorePatherBoundsAI` lets a unit leave the playable area only while the computer drives it, for aircraft that come in from off the map.
- **Trains.** `NoLink` stops a railway car coupling on contact, and a locomotive under direct control runs only while the key is held (whether the 64-bit game differs here is not confirmed).

None of these keys exist in the 64-bit game.

## 4. Terrain and speed

Each cell of a map has one ground type from a fixed list of nine: `undef`, `ground`, `no_pass`, `shallow_water`, `water`, `deep_water`, `swamp`, `road` and `no_pass_human`. A map or a mod cannot add ground types. Ground materials such as mud, snow or ice (set in `set/interaction_terrain/terrains.set`) change effects and sounds but have no speed effect; only the ground type does.

How fast a unit moves on each ground type is set in its pathfinding profile (next section) as a speed factor K. The unit moves at K times its speed there. The route planner turns the same number into a cost of `1/K - 1`, so:

- K of 1 costs nothing and gives full speed.
- K of 0.5 costs 1 and halves the speed.
- K of 0.25 costs 3 and cuts the speed to a quarter.
- K of 0 makes the ground impassable.

Roads and flat ground are therefore cheap and swamp is expensive. Slope does not slow a unit through the profile; the profile's [`Height`](r04-chassis-and-movement.md#height) row only decides how steep a route may be planned, and the vehicle's real climbing power is its `MaxSlope`.

### In Gates of Hell

<!-- goh: GHMOV-05 GHMOV-21 -->

The speed is still K, but the planner's cost is `1/sqrt(K) - 1`: K of 0.5 costs about 0.41 instead of 1, and K of 0.25 costs 1 instead of 3. Units in Gates of Hell therefore cross mud, sand and shallow water more readily, and its `pather.set` is tuned for that. The same profile gives other routes in the two games. On ground with K of 0 a unit that is already there moves at a tenth of its speed (the 64-bit game: an eleventh).

## 5. Pathfinding profiles and obstacles

A pathfinding profile (a "pather" profile) defines how one class of unit sees the map. Profiles live in `set/pather.set` (the vanilla file is named `PATHER.SET`; names are not case-sensitive). A unit picks one with [`PatherID`](r04-chassis-and-movement.md#patherid), for example `{PatherID "tank"}`. Vanilla profile names include `human`, `tank`, `tank.light`, `amphibia`, `armored`, `vehicle.large`, `vehicle.small`, `moto`, the four `cannon.*` profiles, `airborne`, `railway` and the water profiles. An unknown name logs `Unit: Wrong pather name` and the unit fails to load.

The vanilla tank profile:

```
{Profile "tank"
  {Radius 2.25}
  {Priority 5}
  {BattleCrusher}
  {Terrain "road" 1.25 "ground" 0.75 "no_pass" 0 "swamp" 0.5
           "shallow_water" 0.5 "water" 0 "deep_water" 0}
  {Height 0 0 1 2 3  -1 -1 -1 -1 -1  -1 -1 -1 -1 -1}}
```

A factor above 1, such as 1.25 for roads, is capped at 1, so a road can never make a vehicle faster than its `MaxSpeed`; it only stops the open-ground slowdown of 0.75. [`Radius`](r04-chassis-and-movement.md#radius) is the clearance in metres the unit keeps from obstacles. [`Priority`](r04-chassis-and-movement.md#priority) decides who waits when two moving units' paths cross: the lower priority waits, a crusher always wins. [`BattleCrusher`](r04-chassis-and-movement.md#battlecrusher) lets the profile plan through buildings once the unit has seen the enemy. The `Height` row has 15 slope classes of about 6 degrees each; vanilla tanks block everything from about 30 degrees up. A misspelt ground name in `Terrain` is read as `undef` and logs `unknown terrain_pp type - X`.

Obstacles are things on the map such as walls, fences, trees and buildings. An entity names its obstacle row with [`obstacleID`](r04-chassis-and-movement.md#obstacleid), and the costs per profile come from `set/registry/obstacles.reg`. A cost of -1 means impassable; 0 means free; a positive number is a flat cost added once for each crossing, and it lets the planner drive through and break the obstacle. Vanilla gives a tank a cost of 10 for trees and -1 for buildings. If you want tanks to crash through a fence rather than detour for half a kilometre, give the fence a moderate positive cost, not -1. A mod's `obstacles.reg` replaces the whole vanilla table, so copy it complete. An `obstacleID` that is missing from the table only logs `No obstacle ID in <entity>`, but the game can crash later when a crushing vehicle meets that entity; treat the log line as a crash warning.

To make a "swamp crawler" that crosses marsh a normal tank avoids: copy the tank profile in your mod's `pather.set` under a new name, raise the swamp factor from 0.5 to 0.8, and point your vehicle at it with `PatherID`. Copying avoids changing every tank at once.

### In Gates of Hell

<!-- goh: GHMOV-06 GHMOV-07 GHMOV-04 GHMOV-03 GHMOV-08 GHMOV-09 GHMOV-10 GHMOV-13 GHMOV-14 GHMOV-15 -->

- **Grid.** Vehicle cells are 0.8 m, and a step costs the most expensive ground of every height-map cell it crosses, not the ground where it ends. Vehicles fit through gaps half as wide and no longer cut across narrow strips of costly ground.
- **Search area.** A route search looks 25 m around the straight line instead of 5 m, so it finds ways round big obstacles, at the price of longer searches.
- **Straight lines first.** The straight line is priced first and a full search runs only when it costs more than its length times 1.05 for soldiers and 1.3 for vehicles; both are console values. The 64-bit game uses 1.3 for both. Soldiers walk round rough ground more often.
- **Searches in the background.** With `v_asyncPP` on (the default) route searches run beside the game, and an order waits a few moments for its route.
- A route ends with a straight leg to the exact point only when the last cell is close, so more routes stop up to half a cell short of the click.
- **Vaulting.** Soldiers can climb over fences and low walls; see [Vaulting](#vaulting) in the summary.
- An obstacle polygon with a corner the wrong way round is logged once and left out, so units may walk through it; whether the 64-bit game does the same is not confirmed.

## 6. Orders and collisions

Orders are the commands a player or the AI gives: move, attack, hold. A movement order never makes a vehicle exceed its speed setting from section 2. In a multiplayer game a single route search reaches at most 60 m; a farther target is approached in steps and the route is planned again on arrival. When two moving units' routes conflict, the one with the lower profile priority brakes and waits until the way is clear. A move order blocked by a parked unit fails and is not retried, so the unit simply stops. How scripts and the AI choose orders is in [chapter 10](10-ai-and-bots.md) and [chapter 11](11-interaction-scripts.md).

Collision uses collision profiles in `set/colliders.set`, picked with [`collider`](r04-chassis-and-movement.md#collider) (for example `{collider "tank.heavy"}`). Each profile belongs to a group and lists the groups it collides with, can push, or touches without body contact. The file can hold at most 32 distinct groups; a 33rd gets no slot and its collisions go wrong. A profile's [`blocking`](r04-chassis-and-movement.md#blocking) block decides what happens when a vehicle meets something that is not physically simulated:

```
{blocking {speed 10} {penetration 0.2}}
```

A moving unit that is slower than 10 km/h relative to the other thing and less than 0.2 m into it is stopped. A faster or deeper hit is not blocked this way: both fall into physics and the faster one ploughs on. Vanilla vehicles use 10 km/h and 0.2 m; cannons use 20 km/h and 0.3 m. A unit with the tag [`slow_on_crush`](r04-chassis-and-movement.md#slow_on_crush) is slowed to a tenth of its top speed for 1.3 seconds each time it crushes something.

Rigid-body physics (the [`Simulation`](r04-chassis-and-movement.md#simulation) block) lets soldiers be thrown, turrets fly off, trees fall and vehicles slide off slopes. Towing uses two tags, `tractor` on the towing vehicle and `trailer` on the towed one, and model bones `link1` and `link2`; the hook connects when the two link bones are within 12 m. Soldiers are never pushed physically by vehicles (their profile has `noContactsAtAll`); running them over is handled by contact scripts and the vehicle's ram volume, and the details are (unconfirmed).

See also: the AI's use of orders in [chapter 10](10-ai-and-bots.md), and [chapter 21](21-troubleshooting.md#8-symptom-units-that-cannot-move-cannot-be-selected-or-do-not-fire) for units that will not move.

### In Gates of Hell

<!-- goh: GHMOV-01 GHMOV-02 GHMOV-11 GHMOV-12 GHMOV-25 GHMOV-26 GHMOV-52 GHMOV-41 GHMOV-55 GHMOV-54 GHMOV-20 GHMOV-57 GHMOV-50 GHMOV-56 -->

- **Orders.** A new move order given to a walking unit changes its route without stopping it. A point that cannot be reached is tried again up to 10 times at random spots nearby, so a click on a blocked spot walks the unit close to it; a move into an area with no way in goes as near as it can. Detours in multiplayer games are no longer cut short at the search limit.
- **Wheeled routes.** When a car or truck cannot reach a route point, the point is moved half the profile radius to each side and tried again, and tight points are approached by backing off first, so trucks get stuck less.
- **Reversing.** A wheeled or tracked vehicle whose target lies within 45 degrees of straight behind it backs there instead of turning round (`reverse_cone`); the action `vehicle_toggle_reverse` forces reverse.
- **Hitting obstacles.** A vehicle that hits something it cannot push stops dead, is put back a little and stands still for a second (a console value sets how long). In the 64-bit game it keeps grinding into the obstacle.
- **Contacts** are made only when two bodies close in and go deeper than the collider's `penetration`, so resting bodies stop waking each other and grazes are ignored. A vehicle that is immobilised but not destroyed now blocks other vehicles.
- **Towing.** `trailer_medium` needs a `tractor_medium` or `tractor_heavy`, and `trailer_heavy` needs a `tractor_heavy`; untagged trailers and tractors work as here.
- A moving vehicle's obstacle zones follow it at most every 0.1 seconds, a vehicle placed on the map settles onto the ground smoothly, and an object less than 0.5 m above its resting point is put there without falling.

## 7. Tuning in the ARSENAL window

You do not have to edit a `.def` file by hand for the common changes.

- The **Units** page finds a unit by name or id and shows its stats in plain words, including its top speed (`MaxSpeed`). Its "Quick change" box changes price, name, armour, unlock time, rank and head start, and "Add a unit (copy)" copies a vehicle, gun or squad into your mod under a new id.
- "Describe a new unit", on the same page, builds a unit from plain words. It picks the closest game unit, copies it and changes its gun, armour, price, name and speed. The word "fast" raises `MaxSpeed` by a quarter, "slow" lowers it by a fifth, and a number such as "60 km/h" sets it. It changes `MaxSpeed` only, so a unit with fixed Slow and Normal settings still moves at those speeds on orders. A squad has no speed of its own to change there.
- The **Balance** page changes many units at once. Its Change view has a "Top speed" column that you can set, raise by a percentage or multiply. The command way is `ARSENAL balance "<game folder>" --folder mymod --where "id=<unit>" --change "speed set 40" --plan`, then run it again without `--plan` to write.

- The Units page's stat panel also shows the price with its kind of points (MP is manpower, SP the special points of the hero button, and a mod may add its own) and the wait at the start, worked out as unlock time times the game's factor times (1 - head start). **Open model** takes the unit to the Models page, where you can see its volumes, wheels and bones ([chapter 9, section 11](09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window)).
- The Quick Guided Task has a vehicle recipe that asks one question at a time, including `MaxSpeed`, `StartTime`, `BrakeTime`, the turning keys, `Gears`, `RearGears`, the Slow, Normal and Fast speeds, fuel, `PatherID` and `collider` ([Use the Quick Guided Task](p17-quick-guided-task.md)).
All of these write only into your mod folder and show what will change before writing. Pathfinding profiles are still edited by hand, as in the next section. The pages are described in [chapter 19](19-toolchain.md#units--balance-all-games).

### In Gates of Hell

<!-- goh: GHMOV-44 GHMOV-43 -->

Under the GoH button the Units, Balance and Models pages open Gates of Hell units too, but the speed keys mean other things there (section 2), so edit them by hand inside `Locomotion` and check each one. To bring a Gates of Hell vehicle over, the GoH unit page (tab Units & Balance under GoH) builds it on a donor unit of the 64-bit game, and its fold Translate numbers shows each translated speed with the donor's value beside it; see [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md). Because `StartTime`, the speed settings and the slope rule mean different things in the two games (section 2), drive the result in game before you trust it.

## 8. Tuning by hand: examples

**Example A: a faster scout car.** In a copy of a wheeled car, change the speed and keep the class gears, which are fractions and scale with `MaxSpeed` by themselves:

```
{Chassis
  {Locomotion ("locomotion")
    {MaxSpeed 70}
    {maxSpeedAtMaxTurn 15}
    {StartTime 10}}}
```

On a Fast move order this car drives at about 0.92 of 70, roughly 64 km/h, unless its file sets its own `speed` block. The car's real turning circle comes from its model, not from `TurnRadius`; if it takes corners too wide on orders, lower `TurnRadius` so the planned arcs are tighter.

**Example B: a sluggish heavy tank.**

```
{Chassis
  {Locomotion ("locomotion")
    {MaxSpeed 22}
    {StartTime 18}
    {BrakeTime 1.5}
    {TurnTime 14}
    {TurnStart 1.9}
    {Gears 0.1 0.5 1.0}}
  {speed {Slow 8} {Normal 12}}}
```

A long `StartTime`, a long `TurnTime` and a low first gear make it feel heavy. The `speed` block comes after the `Locomotion` block and sets fixed Slow and Normal speeds; Fast stays at 0.92 of 22.

**Example C: no more swamp stalls.** In your copy of `pather.set`, add a profile copied from `tank` under a new name with a higher swamp factor, and set `{PatherID "your_name"}` on the vehicle. `keylint` reports a `PatherID` that names no profile.

**Example D: a gap too narrow.** If a vehicle will not pass between two obstacles, remember that the vehicle path grid cell is 1.6 m and the profile's `Radius` is kept clear on each side, so tight gaps cannot be routed. Widen the gap on the map, or give the vehicle a profile with a smaller `Radius`.

## 9. Checking your work

```
ARSENAL movlint <mod folder> --game <game folder>
ARSENAL keylint <mod folder>
```

`movlint` reports keys the `Locomotion` block does not read, missing `pivot_front` and `pivot_back` bones on wheeled vehicles, and wheel radii of zero. `keylint` reports gear lists that are too long or do not rise, unknown `PatherID` names and more than 32 collider groups. After the checks, drive the unit in game both by orders and in direct control, and read `game.log` for the warnings quoted in this chapter. See [chapter 18](18-testing-and-logs.md).

See also: [Change a unit's numbers](p02-change-unit-numbers.md), [Add a new unit](p03-add-a-unit.md), [Check, fix and read the log](p14-check-fix-read-log.md).

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. Units and scale | [differs](#in-gates-of-hell) | vehicle grid cells of 0.8 m |
| 2. Vehicle keys and `Locomotion` | [differs](#in-gates-of-hell-1) | speed settings inside `Locomotion`; other `StartTime` and slope rules |
| 3. Chassis types | [differs](#in-gates-of-hell-2) | helicopters; wheel radius from volumes; no swimming in shallow water |
| 4. Terrain and speed | [differs](#in-gates-of-hell-3) | cheaper costly ground: `1/sqrt(K) - 1` |
| 5. Pathfinding profiles and obstacles | [differs](#in-gates-of-hell-4) | finer grid, wider search, vaulting |
| 6. Orders and collisions | [differs](#in-gates-of-hell-5) | retries, reversing, stall on obstacles, towing weights |
| 7. Tuning in the ARSENAL window | [differs](#in-gates-of-hell-6) | Units and Balance pages are for the 64-bit game; port with GoH unit |
| 8. Tuning by hand: examples | not mapped | the examples are for the 64-bit game |
| 9. Checking your work | not mapped | `movlint` checks the 64-bit game's rules |

### Helicopters

<!-- goh: GHMOV-28 GHMOV-29 GHMOV-62 GHMOV-18 GHMOV-19 GHMOV-30 GHMOV-53 -->

Gates of Hell has a `helicopter` chassis and brain. Its keys: `MaxFrontSlope` 15 degrees, `MaxSideSlope` 25 degrees, `FrontSlopeSpeed` and `SideSlopeSpeed` 10, `MaxElevationSpeed` 5, `ElevationAcceleration` 2, `MaxAltitude` 30 m, `TravelAltitude` 15 m and `EngineStartupTime` 3 seconds. A move flies at the highest ground on the route plus the travel height. When its fuel falls below 25 it lands, and with no crew in the air it falls. It comes down before unloading men, and refuses to unload where there is no free place below. In a multiplayer match it appears in the air, except in cooperative games. Scripts set its height with `chassis/helicopter/RequestAltitude` (`Altitude`, `KeepAltitude`, `StopEngine`); the old `chassis/airborne/TargetAltitude` name is gone there, while the 64-bit game keeps it. The 64-bit game has no helicopter chassis, so a Gates of Hell helicopter cannot be brought over as one.

### Vaulting

<!-- goh: GHMOV-13 GHMOV-14 -->

An obstacle row in Gates of Hell can carry `flag_vaultable`. A soldier's route may then cross it head on, within 45 degrees of straight across, at the obstacle's cost; walking along it or standing on it is still blocked. A soldier facing such an obstacle plays `getover_middle` and then plans again from the far side, so the animation must exist. The 64-bit game has neither the flag nor the climb.

## Pitfalls

- A vehicle written without the class `locomotion` macro and without `TurnTime` turns almost instantly.
- A second `Locomotion` block resets Slow, Normal and Fast. Put any `speed` block last.
- `Gears` and `RearGears` are fractions of `MaxSpeed`, at most five, strictly rising. A bad list is only logged, and the vehicle loads with it.
- Ordered moves are capped by the Slow, Normal and Fast settings; only direct control reaches `MaxSpeed`. A unit with its own fixed `speed` values does not speed up on orders when you raise `MaxSpeed`.
- `TurnRadius` shapes planned corners; it does not set a wheeled vehicle's real turning circle.
- A wheeled vehicle without exactly named `pivot_front` and `pivot_back` bones steers wrongly; the log warns once.
- A terrain factor K gives a speed of K and a planner cost of `1/K - 1`; factors above 1 are capped at 1, so roads never exceed `MaxSpeed`.
- An `obstacleID` missing from `obstacles.reg` is only logged, but can crash the game later. A mod's `obstacles.reg` replaces the whole table.
- Soldiers share one speed table; changing it affects all of them.
- Fuel is used only in direct control.

Next: [Infantry and humans](08-infantry-and-humans.md).
