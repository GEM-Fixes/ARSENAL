# Reference 4: Chassis, Movement, Wheels and Tracks

This page lists every key that decides how a unit moves: the `{Chassis}` block and its types, the `{Locomotion}` block,
fuel and speed settings, the foot speed table of soldiers, the model bones that wheels and tracks need, moving bones,
pathfinding profiles, obstacles, collision profiles and physics. [Chapter 7](07-units-vehicles-movement.md) explains how these pieces work together
([Units, vehicles and movement](07-units-vehicles-movement.md)); this page gives the facts for each key.

How to read an entry. "Where" names the file kind and the block the key is written in. "Type" gives the kind of value
and its unit. "Values" gives what the game accepts and, when it is known, the value used when the key is absent.
"Limits" lists what fails silently, crashes or is ignored. Keys are not case-sensitive: `MaxSpeed`, `maxspeed` and
`Maxspeed` are the same key.

Units used on this page: lengths in metres, vehicle speeds in km/h, angles in degrees, angular speeds in degrees per
second, times in seconds. Inside the game one length unit is 0.05 m, so 20 units make a metre; you meet the inner unit
only in a few log lines and console values.

Work in your own mod folder. Text data files use CRLF line endings, string values are read as UTF-8, identifiers are
ASCII, and old cp1251 bytes in vanilla `;` comments should be kept as they are.

The quick way: in the ARSENAL window the Quick Guided Task "make a vehicle" or "change a vehicle" asks for the common keys
of this page as plain questions, in its groups "Speed and fuel" and "Advanced: slopes and driving feel" (see
[Use the Quick Guided Task](p17-quick-guided-task.md)). This page tells you what each answer does.

Gates of Hell (GoH) reads many of these keys too, sometimes in another way. An entry that GoH treats differently has a
line that starts "Gates of Hell:"; keys that only GoH has are listed at the end, under
[Gates of Hell only](#gates-of-hell-only).

## The chassis block

### Chassis

Where: entity `.def`, or the class `.ext` file it extends (`properties/car.ext`, `properties/tank_unarmed.ext` and
others).    Type: block, with an optional type word.

Values: `foot`, `wheel`, `track`, `railway`, `water`, `airborne`, `torpedo`, `human_carrier`. In vanilla the type word is
usually written once in the class `.ext` file (`{Chassis "track"}` in `tank_unarmed.ext`, `{Chassis "wheel"}` in
`car.ext`), and the unit's own `.def` adds a second `{Chassis ...}` block without a type word that fills in the details.

Does: picks the movement model of the entity. `foot` is used by soldiers and animals, `wheel` by cars, armoured cars,
motorcycles and the ground roll of aircraft, `track` by tanks and by towed guns, `railway` by trains, `water` by boats,
`airborne` by aircraft in flight, `torpedo` by torpedoes, and `human_carrier` by guns that crew members push by hand
(mortars, machine-gun carriages). Wheel, track, water and railway chassis share one vehicle core, so the `{Locomotion}`
block and most keys below work for all four.

Limits: a half-track is a wheel chassis or a track chassis by its type word only; the track or wheel marks drawn on the
ground (`tank_trace`, `car_trace`) do not change its physics. An entity may carry two `{Chassis}` blocks of different
types and switch between them with `{Switch}` (a seaplane has `airborne` and `water`).

<!-- goh: GHMOV-28 GHMOV-29 -->
Gates of Hell: there is one more type, `helicopter`, with its own keys (see [helicopter chassis](#helicopter-chassis)).
This game has no helicopter chassis, so a GoH helicopter cannot be ported as it is.

Example:
```
{Chassis "track"
  {FuelBag {volume 250} {rate 50} {remain 250} {fuel "fuel"}}
  {speed {Slow 15} {Normal 25} {Fast 25}}}
```

See: [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Locomotion](#locomotion); [Switch](#switch); [Part I: Add a new unit](p03-add-a-unit.md).

### Switch

Where: inside `{Chassis}`.    Type: block of conditions.

Values: `{terrain "type" ...}` and `{terrain not "type" ...}` with ground type names (see [Terrain](#terrain)), and the
flag `exitFromWater` (seen in vanilla data, not described further).

Does: tells an entity with more than one chassis when to use this one, by the ground type under it.

Limits: none recorded.

Example:
```
{chassis "water" ("chassis_defaults") {waterline -1.8}
  {switch {terrain "water" "deep_water"}}}
```

See: [Chassis](#chassis); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

### Driver

Where: inside `{Chassis}`.    Type: text, a seat group name.

Values: the name of a seat group from the entity's `placer`.

Does: names the crew that must be present for the chassis to move.

Limits: none recorded.

<!-- goh: GHMOV-24 -->
Gates of Hell: the seat group it names may end with `minworkers N`; the vehicle then drives once N of its driver seats
are filled. This game has no `minworkers`: in a crew block it stops loading with "Block terminator expected", so take it
out when you port (`ARSENAL portfix minworkers` does this for gunner, charger and workers blocks).

Example:
```
{Chassis {Driver "crew"}}
```

See: reference 3, [placer](r03-extenders-and-components.md#placer-seats) and [group](r03-extenders-and-components.md#group); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

### DisableForward

Where: inside `{Chassis}`.    Type: flag.

Values: present or absent.

Does: forbids the route builder to plan forward driving for this chassis. Aircraft use the matching `DisableBackward`.
Using it to stop one direction from a script (for example a damaged gearbox) may work, but this is not confirmed.

Limits: a tracked vehicle compares a forward and a reverse route and picks the cheaper; with one direction forbidden it
never plans that direction, even when it is the only way out.

<!-- goh: GHDC-50 GHMOV-16 -->
Gates of Hell: the flags also hold back that direction on the keys of direct control, for soldiers as well as vehicles.

Example:
```
{Chassis "airborne" {disableBackward}}
```

See: [DisableBackward](#disablebackward); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

### DisableBackward

Where: inside `{Chassis}`.    Type: flag.

Values: present or absent.

Does: forbids planned reverse driving. Vanilla aircraft set it in `properties/airborne.ext`.

Limits: as for `DisableForward`.

Example:
```
{Chassis "wheel" ("chassis_defaults") {dontUseSlope} {ignorePatherBounds} {disableBackward}}
```

See: [DisableForward](#disableforward); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

### IgnorePatherBounds

Where: inside `{Chassis}`.    Type: flag.

Values: present or absent.

Does: lets the chassis move outside the map area that path planning normally keeps units inside. Vanilla trains,
aircraft and seaplanes set it.

Limits: none recorded.

<!-- goh: GHMOV-22 -->
Gates of Hell: also has [IgnorePatherBoundsAI](#ignorepatherboundsai), which lets the chassis leave the map area only
while the computer drives it.

Example:
```
{Chassis "railway" {ignorePatherBounds}}
```

See: [Pathfinding](#pathfinding-profiles); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

### DisableMoveWhileFiring

Where: inside `{Chassis}` of a vehicle or gun `.def`.    Type: flag.

Values: present or absent.

Does: the unit cannot move while it fires. Vanilla uses it on a few rocket half-tracks and heavy guns.

Limits: none recorded.

Example:
```
{Chassis {DisableMoveWhileFiring}}
```

See: [reference 6](r06-weapons-and-ammunition.md); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

### MovementMode

Where: inside `{Chassis}`.    Type: whole number.

Values: a movement mode number.

Does: sets the chassis movement mode. Together with `MovementModeLimit` it can hold a unit to one gait (unconfirmed).

Limits: none recorded.

Example:
```
{Chassis {MovementMode 1}}
```

See: [MovementModeLimit](#movementmodelimit); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

### MovementModeLimit

Where: inside `{Chassis}`.    Type: whole number.

Values: a movement mode number.

Does: caps the fastest gait the chassis may use. For soldiers the stamina model sets this limit while they play (see
reference 3, [`movement_limits`](r03-extenders-and-components.md#movement_limits)).

Limits: none recorded.

Example:
```
{Chassis {MovementModeLimit 2}}
```

See: reference 3, [vitality](r03-extenders-and-components.md#vitality); [movement_limits](r05-humans.md#movement_limits); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

### MovementSpeed

Where: inside `{Chassis}`.    Type: number.

Values: not described beyond its type.

Does: holds the movement speed of the chassis.

Limits: none recorded.

Example:
```
{Chassis {MovementSpeed 10}}
```

See: [speed](#speed); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

### Broken

Where: inside `{Chassis}`.    Type: flag.

Values: present or absent.

Does: marks the chassis as broken.

Limits: none recorded.

Example:
```
{Chassis {Broken}}
```

See: reference 2, [component](r02-entity-definition.md#component); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

### track_size

Where: inside `{Chassis}`.    Type: numbers.

Values: two numbers in the only vanilla uses, which are commented out.

Does: the game reads it as a chassis key beside `track`; what it does is not described.

Limits: none recorded.

Example:
```
;{track_size 0.75 0.7}
```

See: [Track](#track); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [Part I: Add a new unit](p03-add-a-unit.md).

## The Locomotion block

### Locomotion

Where: inside `{Chassis}` of a wheel, track, water, railway or airborne entity.    Type: block.

Values: the keys below. Vanilla writes it as `{Locomotion ("locomotion") {MaxSpeed 33} ...}`: the macro
`locomotion` from the class `.ext` file fills in the class defaults and the unit's own keys after it override them.

Does: sets top speed, acceleration, braking, turning and gears. The game starts from its own defaults, reads the keys,
and works out the derived values (acceleration, the three speed settings) when the block closes.

Limits: an unknown key inside `Locomotion` stops with "unexpected token" in the log, so a typo is loud. A second
`Locomotion` block in the same chassis works everything out again and resets Slow, Normal and Fast, so put any
`{speed}` block after the last `Locomotion` block. A vehicle with no `Locomotion` block at all keeps slower built-in
defaults (30 degrees per second turning and a 2 second stop).

<!-- goh: GHMOV-44 GHMOV-45 GHMOV-60 GHKEY-11 GHMOV-49 -->
Gates of Hell: `Slow`, `Normal` and `Fast` are written inside `Locomotion`, and a separate `{speed}` block is skipped.
In this game those three words inside `Locomotion` stop loading with "unexpected token"; `ARSENAL portfix locospeed`
moves them into a `{speed}` block. GoH also reads a `BoostFactor` key here and does nothing with it; this game rejects
it, so drop it. A GoH vehicle with no movement block starts half as fast and brakes harder than here.

Example:
```
{Locomotion ("locomotion") {maxspeed 33} {maxSpeedAtMaxTurn 13}
  {StartTime 15} {TurnTime 10} {TurnStart 1.6} {TurnRadius 10}
  {Gears 0.2 0.4 1} {RearGears 0.27}}
```

See: [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [speed](#speed); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### MaxSpeed

Where: inside `{Locomotion}`; also inside a `torpedo` chassis.    Type: number, km/h.

Values: built-in default 25. Vanilla vehicles range from 2 to 95 (95 is an aircraft); the class macros all use 25.

Does: the top speed on flat ground. Terrain multiplies it by the ground's speed factor, which is never above 1.

Limits: only a player in direct control reaches `MaxSpeed`. A move order never goes faster than the chosen Slow, Normal
or Fast setting, which default to 0.45, 0.67 and 0.92 of `MaxSpeed`. A road can never make a vehicle faster than
`MaxSpeed`.

<!-- goh: GHMOV-46 -->
Gates of Hell: direct control too stays at `Fast` unless the player holds the run key; only then is `MaxSpeed` reached.
A vehicle with a gun is also slowed by the share of its gun crew seats that are empty: with half the gun crew it drives
at half speed.

Example:
```
{Locomotion ("locomotion") {MaxSpeed 36}}
```

See: [speed](#speed); [Terrain](#terrain); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### MaxSpeedAtMaxTurn

Where: inside `{Locomotion}`.    Type: number, km/h.

Values: built-in default 10; the car and armoured-car macros use 15. Vanilla ranges from 5 to 20.

Does: the speed cap while steering at full lock. Between straight and full lock the cap slides between `MaxSpeed` and
this value.

Limits: it works only in direct control. Ordered moves ignore it, so tuning it does not change how fast the AI or an
ordered unit takes a corner.

Example:
```
{Locomotion ("locomotion") {MaxSpeed 35} {maxSpeedAtMaxTurn 12}}
```

See: [MaxSpeed](#maxspeed); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### StartTime

Where: inside `{Locomotion}`.    Type: number, seconds.

Values: built-in default 1. Class macros: 15 for cars and armoured cars, 6 for tanks, 10 for boats and motorcycles.
Vanilla ranges from 1 to 20.

Does: sets acceleration. In top gear a vehicle gains `MaxSpeed / StartTime` per second; in lower gears it gains more,
because the gain is divided by the gear's fraction.

Limits: none recorded.

<!-- goh: GHMOV-43 -->
Gates of Hell: `StartTime` is the time to top speed through all forward gears, and the coasting slowdown is not taken
off while the engine pulls. The same `StartTime` therefore gives a different acceleration in the two games; retune it
when you port in either direction.

Example:
```
{Locomotion ("locomotion") {MaxSpeed 13} {StartTime 13}}
```

See: [Gears](#gears); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### BrakeTime

Where: inside `{Locomotion}`.    Type: number, seconds.

Values: built-in default 0.5. Vanilla ranges from 0.6 to 15; 1.5 is the most common value.

Does: sets braking. The total braking rate is `MaxSpeed / BrakeTime`; an ordered move starts braking when its stopping
distance reaches the next stop point of the route.

Limits: an ordered move never reverses to stop; it brakes to a halt at every stop point of the route, including the
point where it changes from forward to reverse.

<!-- goh: GHMOV-43 -->
Gates of Hell: the braking rate is `MaxSpeed / BrakeTime` with no coasting part taken off, so the same value brakes a
little differently.

Example:
```
{Locomotion ("locomotion") {BrakeTime 1.5} {StopTime 2.5}}
```

See: [StopTime](#stoptime); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### StopTime

Where: inside `{Locomotion}`.    Type: number, seconds.

Values: built-in default 1. Vanilla ranges from 0.2 to 10; towed guns use 0.2.

Does: sets the coasting slowdown, `MaxSpeed / StopTime` per second, when nothing pushes the vehicle. The same friction
is taken off every frame while the vehicle accelerates.

Limits: none recorded.

Example:
```
{Locomotion ("locomotion") {StopTime 2}}
```

See: [BrakeTime](#braketime); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### TurnRadius

Where: inside `{Locomotion}`.    Type: number, metres.

Values: built-in default 5. Class macros: 8 for cars, armoured cars, boats and motorcycles, 5 for tanks, 2 to 3 for
towed guns. Vanilla ranges from 2 to 90.

Does: the radius of the arcs the route builder puts into corners of a planned path, for wheels, tracks and boats.

Limits: it is not a limit on turning in place: a tracked vehicle still pivots on the spot. For a wheeled vehicle the
physical turning radius comes from the model: the distance between its `pivot_front` and `pivot_back` bones and its
largest steering angle.

Example:
```
{Locomotion ("locomotion") {TurnRadius 6} {MaxSpeed 36}}
```

See: [pivot_front and pivot_back](#pivot_front-and-pivot_back); [SplineRadius](#splineradius); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### TurnTime

Where: inside `{Locomotion}`.    Type: number, seconds.

Values: built-in default 1 second for a full circle, which is 360 degrees per second. The tank macro uses 5. Vanilla
ranges from 2 to 60.

Does: the time for a full 360 degree turn; the turn speed is one circle per `TurnTime`.

Limits: leaving it out makes a vehicle turn almost instantly; 98 vanilla vehicles omit it (aircraft and wheeled
vehicles that rely on `TurnRadius`). Set it on every tracked vehicle.

Example:
```
{Locomotion ("locomotion") {TurnTime 11} {TurnStart 1.8} {TurnStop 0.8}}
```

See: [TurnStart](#turnstart); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### TurnStart

Where: inside `{Locomotion}`.    Type: number, seconds.

Values: built-in default 1. The tank macro uses 0.8. Vanilla ranges from 0.6 to 6.

Does: tracked vehicles only: the time the turn speed takes to build up from zero to full while steering is held.

Limits: no effect on other chassis types.

Example:
```
{Locomotion ("locomotion") {TurnStart 1.6}}
```

See: [TurnStop](#turnstop); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### TurnStop

Where: inside `{Locomotion}`.    Type: number, seconds.

Values: built-in default 0.5. Vanilla ranges from 0.5 to 1.1.

Does: tracked vehicles only: the time the turn speed takes to die down when steering stops. An ordered turn starts to
brake early enough to stop on the target heading.

Limits: no effect on other chassis types.

Example:
```
{Locomotion ("locomotion") {TurnStop 0.8}}
```

See: [TurnTime](#turntime); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### Gears

Where: inside `{Locomotion}`.    Type: list of numbers, each a fraction of `MaxSpeed`.

Values: 1 to 5 numbers, strictly rising, the last normally 1.0. Built-in default `0.2 0.3 0.5 0.7 1.0`. Class macros:
`0.1 0.5 0.8 1.0` for cars, `0.2 0.3 0.5 0.7 1.0` for tanks, `0.5 0.7 1.0` for boats. Many vanilla tanks use
`0.2 0.4 1`.

Does: each gear caps speed at its fraction of the current top speed. The vehicle shifts up above 0.9 of the gear's cap
when it can still accelerate, and shifts down when it falls below the cap of the gear below. Lower gears accelerate
faster.

Limits: more than five numbers logs "Too many gears specified"; numbers that do not rise log "Gear ratios must have
ascending order". Both are logged, not fatal, so the vehicle loads with a wrong gear list. The numbers are fractions,
not speeds in km/h: a list such as `15 30 50` is wrong.

Example:
```
{Locomotion ("locomotion") {MaxSpeed 25} {Gears 0.2 0.4 1} {RearGears 0.45}}
```

See: [RearGears](#reargears); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### RearGears

Where: inside `{Locomotion}`.    Type: list of numbers, fractions of `MaxSpeed`.

Values: same rules as `Gears`. Built-in default is the same list as `Gears`. Class macros: `0.35` for cars, `0.2 0.5`
for tanks, `0.15 0.3` for boats.

Does: the gear caps when driving in reverse, so `{RearGears 0.27}` gives a top reverse speed of 0.27 of `MaxSpeed`.

Limits: as for `Gears`.

Example:
```
{Locomotion ("locomotion") {RearGears 0.27}}
```

See: [Gears](#gears); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### SteerOn

Where: inside `{Locomotion}`.    Type: number, degrees per second.

Values: built-in default 80; the car, boat and motorcycle macros use 20.

Does: wheeled and water chassis only: how fast the wheels turn toward the wanted steering angle while steering.

Limits: no effect on tracked vehicles. The steering angle never passes the model's largest steering angle.

Example:
```
{Locomotion ("locomotion") {SteerOn 20} {SteerOff 40}}
```

See: [steerMax and wheelradius](#steermax-and-wheelradius); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### SteerOff

Where: inside `{Locomotion}`.    Type: number, degrees per second.

Values: built-in default 80; the car, boat and motorcycle macros use 40.

Does: wheeled and water chassis only: how fast the wheels return to straight.

Limits: no effect on tracked vehicles.

Example:
```
{Locomotion ("locomotion") {SteerOff 40}}
```

See: [SteerOn](#steeron); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### SplineRadius

Where: inside `{Locomotion}`.    Type: number, metres.

Values: built-in default 2. The car macro uses 1, armoured cars, boats and motorcycles 3, aircraft 5.

Does: wheeled chassis only: the spacing the car route builder uses when it smooths a path into curves.

Limits: a wheeled vehicle never turns in place and rejects any planned route with a sharp corner, so it relies on these
curves.

Example:
```
{Locomotion ("locomotion") {TurnRadius 8} {SplineRadius 3}}
```

See: [TurnRadius](#turnradius); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### MaxSlope

Where: inside `{Locomotion}`.    Type: number, degrees.

Values: built-in default 30. The small towed-gun macro uses 50.

Does: uphill pull fades as the slope grows: the throttle is multiplied by `1 - (slope / MaxSlope)` squared. At or above
`MaxSlope` there is no pull and the vehicle rolls back.

Limits: path planning has its own slope rule in the pather profile (see [Height](#height)): vanilla tank profiles do
not plan routes steeper than about 30 degrees, whatever `MaxSlope` says. A steeper climb is possible only in direct
control.

<!-- goh: GHMOV-42 GHMOV-47 -->
Gates of Hell: the slope lowers both the pull and the top speed, by `1 - (slope / MaxSlope)` raised to a power that is
2 in top gear and up to 4 in first gear, so low gears climb better. Ordered and AI moves use the same factor, so GoH
vehicles drive slower uphill than here.

Example:
```
{locomotion ("loco_params") {MaxSlope 50} {FallSlope 60} {MaxSpeed 12}}
```

See: [FallSlope](#fallslope); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### FallSlope

Where: inside `{Locomotion}`.    Type: number, degrees.

Values: built-in default 45. Towed-gun macros use 60.

Does: when the vehicle body tilts more than `FallSlope` for over 0.32 seconds while moving, it leaves normal driving and
falls into rigid-body physics (it slides or tumbles). A vehicle standing tilted with no speed only refuses move orders.

Limits: a vehicle tilted more than 70 degrees counts as not upright: it cannot be crewed or driven until it is righted.

Example:
```
{locomotion ("loco_params") {FallSlope 60} {MaxSpeed 10}}
```

See: [Simulation](#simulation); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### GearSwitchDelay

Where: inside `{Locomotion}`.    Type: number, seconds.

Values: built-in default 0. The tank macro uses 0.5.

Does: in direct control, the wait after the vehicle stops before it starts moving the other way.

Limits: none recorded.

Example:
```
{Locomotion ("locomotion") {GearSwitchDelay 0.5}}
```

See: [Gears](#gears); [chapter 7, section 2](07-units-vehicles-movement.md#2-vehicle-keys-and-the-locomotion-block); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

## Speed settings, fuel and saved state

### speed

Where: inside `{Chassis}`.    Type: block with `Slow`, `Normal` and `Fast`, each in km/h.

Values: with a `Locomotion` block, Slow, Normal and Fast default to 0.45, 0.67 and 0.92 of `MaxSpeed`. Without one, the
built-in values 5, 10 and 20 km/h stay. Vanilla `chassis_defaults` uses 10, 17 and 30; many tank `.def` files write
`{speed {Normal 10} {Slow 16}}`.

Does: the three speeds a player or the AI can order. A `{speed}` block names only the settings it changes; the others
keep their default fractions.

Limits: write `{speed}` after the last `Locomotion` block of the chassis, because a later `Locomotion` resets all three.
The game does not check that Slow is below Normal and Normal below Fast: when it needs a speed it takes the first of
slow, normal, fast (in that order) that is fast enough, so unordered values give odd choices. 204 vanilla vehicles have
Slow above Normal.

<!-- goh: GHMOV-44 GHMOV-47 -->
Gates of Hell: the three speeds are read only inside `Locomotion` (see [Locomotion](#locomotion)) and there are no
default fractions of `MaxSpeed`. A vehicle from this game taken to GoH with its `{speed}` block keeps the built-in 5,
10 and 20 km/h. Ordered moves are also slowed on slopes and when crushing.

Example:
```
{Chassis {Locomotion ("locomotion") {MaxSpeed 33}}
  {speed {Normal 10} {Slow 16}}}
```

See: [MaxSpeed](#maxspeed); [chapter 7, speed settings](07-units-vehicles-movement.md#speed-settings-why-an-ordered-unit-is-slower); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### FuelBag

Where: inside `{Chassis}`.    Type: block.

Values: `{volume}` tank size in litres, `{remain}` fuel in the tank in litres, `{rate}` use in litres per kilometre
(written as the vanilla files write it), `{fuel "tags"}` the stuff tag of the fuel it takes. Vanilla `chassis_defaults`
uses volume 200, rate 20, remain 200, fuel "fuel"; tanks range up to 950 litres.

Does: gives the vehicle a fuel tank. Fuel is used only while a player directly controls the vehicle. With no `fuel`
tag the vehicle uses no fuel. At zero fuel the vehicle no longer needs a crew to count as manned.

Limits: ordered and AI movement do not use fuel.

<!-- goh: GHGPL-27 -->
Gates of Hell: a supply zone can refill the tank through a `{fuel {amount} {max} {value}}` block, at a price per litre.
This game has no such block, so a GoH fuel truck does not refuel here.

Example:
```
{FuelBag {volume 560} {rate 115} {remain 560} {fuel "fuel"}}
```

See: [chapter 7, speed settings](07-units-vehicles-movement.md#speed-settings-why-an-ordered-unit-is-slower); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### DontUseSlope

Where: inside `{Chassis}`.    Type: flag.

Values: present or absent.

Does: the vehicle ignores slopes: its suspension angles stay at zero. Vanilla aircraft set it.

Limits: none recorded.

Example:
```
{Chassis "airborne" ("chassis_defaults") {dontUseSlope}}
```

See: [MaxSlope](#maxslope); [chapter 7, speed settings](07-units-vehicles-movement.md#speed-settings-why-an-ordered-unit-is-slower); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### CurrentSpeed

Where: inside `{Chassis}` of a saved game.    Type: number.

Values: written by the game.

Does: saves the current speed. `CurrentGear`, `CurrentGearDir` and `CurrentTurnSpeed` save the gear, the gear direction
and the turn speed the same way.

Limits: these keys belong in saves; a mod has no reason to write them.

Example:
```
{Chassis {CurrentSpeed 0} {CurrentGear 0}}
```

See: [Locomotion](#locomotion); [chapter 7, speed settings](07-units-vehicles-movement.md#speed-settings-why-an-ordered-unit-is-slower); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

## Water chassis

### WaterLine

Where: inside `{Chassis "water"}`.    Type: number, metres.

Values: vanilla uses -1.8 (a seaplane) and 1.4.

Does: the draught of the hull: the hull sits at water level minus the current water line. A spot is passable for the
boat when the water there is deeper than the water line.

Limits: a boat given a target on dry ground refuses the order. A boat never turns in place and rejects routes with
sharp corners, like a wheeled vehicle.

Example:
```
{chassis "water" ("chassis_defaults") {ignorePatherBounds} {waterline -1.8}}
```

See: [SinkSpeed](#sinkspeed); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types).

### CurWaterLine

Where: inside `{Chassis "water"}`.    Type: number, metres.

Values: written by the game.

Does: the current water line. It moves toward `WaterLine` at `SinkSpeed` each step; while the two differ the chassis
counts as moving.

Limits: none recorded.

Example:
```
{chassis "water" {CurWaterLine 1.4}}
```

See: [WaterLine](#waterline); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types).

### SinkSpeed

Where: inside `{Chassis "water"}`.    Type: number.

Values: no vanilla file sets it.

Does: the rate at which the current water line moves toward `WaterLine`.

Limits: none recorded.

Example:
```
{chassis "water" {WaterLine 1.4} {SinkSpeed 0.1}}
```

See: [WaterLine](#waterline); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types).

## Wheel, track and steering bones

These are not keys you write in a `.def` file but bone names and bone parameters in the model (`.mdl`). The chassis
looks them up by name, so a model for a wheeled or tracked vehicle must keep them.

### pivot_front and pivot_back

Where: model skeleton of a wheel or water chassis.    Type: bone names.

Values: exactly `pivot_front` and `pivot_back` (not case-sensitive). A `main` parameter on `pivot_front` changes which
axle counts.

Does: the distance between the two bones is the wheelbase. Steering and the physical turning radius are worked out
from it.

Limits: a missing bone logs a warning (`no "pivot_front" & "pivot_back" bones in <unit>`) and the vehicle steers wrongly.
The match is exact: `pivot_front001` does not count. Four vanilla ships ship with such numbered names.

Example:
```
{bone "pivot_front" {parameters "main;"}}
{bone "pivot_back"}
```

See: [steerMax and wheelradius](#steermax-and-wheelradius); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### steerMax and wheelradius

Where: parameters of the `basis` bone of a wheeled model.    Type: numbers; `steerMax` in degrees.

Values: `steerMax` defaults to 45.

Does: `steerMax` is the largest steering angle; the physical turning radius is the wheelbase divided by its tangent.
`wheelradius` is the wheel radius for the chassis.

Limits: a basis `WheelRadius` of 0 logs "Wheel radius is zero".

<!-- goh: GHMOV-51 -->
Gates of Hell: a wheel that has a cylinder volume on its bone takes its radius from that volume, and every wheel touches
the ground at its own radius. The same model can therefore sit at another height or tilt in the two games; check the
wheel volumes when you port.

Example:
```
{bone "basis" {parameters "steerMax=35;"}}
```

See: [pivot_front and pivot_back](#pivot_front-and-pivot_back); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### wheel bones

Where: model skeleton of a wheeled vehicle.    Type: revolute bones whose names start with `wheel`.

Values: each with a `radius` parameter.

Does: the visible wheels, turned as the vehicle rolls.

Limits: a `radius` parameter of 0 logs `Invalid bone "x" radius in entity`. A wheel bone with no radius parameter is not
an error.

<!-- goh: GHMOV-51 GHFMT-21 -->
Gates of Hell: a wheel whose parent bone is named `suspension` moves up and down with the ground (see
[suspension bone](#suspension-bone)); here such a wheel stays fixed.

Example:
```
{bone revolute "wheel_l1" {parameters "radius=0.45;"}}
```

See: [support bones](#support-bones); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### steer bones

Where: model skeleton of a wheeled vehicle.    Type: bones whose names start with `steer`.

Values: any number.

Does: the bones turned by steering.

Limits: none recorded.

Example:
```
{bone "steer_l"}
```

See: [SteerOn](#steeron); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### support bones

Where: model skeleton of a wheeled vehicle.    Type: bones whose names start with `support`, or bones with a `support`
parameter.

Values: three or more for the game to use them.

Does: the points where the vehicle touches the ground. With fewer than three, the game builds a grid of contact points
along the `trackleft` part instead.

Limits: none recorded.

Example:
```
{bone "support1"} {bone "support2"} {bone "support3"} {bone "support4"}
```

See: [wheel bones](#wheel-bones); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### roller and roller_joint

Where: model skeleton of a tracked vehicle.    Type: bone names; `roller` has a `radius` parameter.

Values: exactly `roller` and `roller_joint`: the game looks for one bone of each name.

Does: the `roller` bone and its `roller_joint` follow the ground under the track, turning at most 0.1 radians per game
step.

Limits: only these two names count. Numbered bones such as `roller1` or `roller_01` do not follow the ground.

<!-- goh: GHFMT-20 GHMOV-38 -->
Gates of Hell: the road wheels are numbered bones `roller_01`, `roller_02` and on, each with its own `radius` and its
own `roller_NN_joint`; the list stops at the first missing number. Each road wheel follows the ground on its own. A GoH
tank model here moves no road wheel unless one bone is renamed `roller` and `roller_joint`, and a model from this game
in GoH keeps its running gear still.

Example:
```
{bone "roller" {parameters "radius=0.3;"}}
```

See: [trackleft and trackright](#trackleft-and-trackright); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### trackleft and trackright

Where: volume and part (`component`) names of a tracked vehicle, set by the `tracks` macro in `properties/vehicle.ext`.
Type: names.

Values: `trackleft`, `trackright`.

Does: the two track parts. When one is damaged while the tank drives faster than half its Slow speed, the tank swerves.
A wheeled vehicle with fewer than three support bones uses `trackleft` for its contact grid.

Limits: none recorded.

Example:
```
{volume "trackleft" {thickness 20} {tags "mover" "track"}}
{component "trackleft" {RepairTime 10} {tags "mover" "track"}}
```

See: reference 7, [volume](r07-armour-volumes-damage.md#volume); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### Track

Where: inside `{Chassis}`, usually through the `tank_trace` and `car_trace` macros of `properties/vehicle.ext`.
Type: block with a name.

Values: in vanilla `{Track "left"}`, `{Track "right"}` or a wheel bone name, holding `{Tracer {View} {Bone} {Step}}` and
`{TextureScroller {Bone} {Length}}`.

Does: the marks a vehicle leaves on the ground and the scrolling of the track texture.

Limits: these blocks are visual only. They do not make a vehicle tracked or wheeled.

Example:
```
{Chassis ("tank_trace" fx("tracks_mid") step(0.52) len(0.2)) {Locomotion ("locomotion")}}
```

See: [Chassis](#chassis); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### tractor and trailer

Where: entity tags; bones `link1` and `link2` in the models.    Type: tags and bone names.

Values: `tractor` on the towing vehicle, `trailer` on the towed one.

Does: towing. The vehicle moves to the trailer's `link1` bone (or the tractor's `link2` bone) and hooks when the two
link bones are within 12 m. A towed gun must first switch to its travel mode.

Limits: the hook fails beyond 12 m or without the two tags. The trailer must be selectable, and if it is crewed it
must have the same owner.

<!-- goh: GHMOV-20 -->
Gates of Hell: adds weight classes: a trailer tagged `trailer_medium` needs a tractor tagged `tractor_medium` or
`tractor_heavy`, and `trailer_heavy` needs `tractor_heavy`. Untagged units tow as here; the tags do nothing in this game.

Example:
```
{props "tractor"}
```

See: reference 3, [cannon](r03-extenders-and-components.md#cannon); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

## Moving bones (turrets, guns, hatches)

### bone

Where: entity `.def`, top level.    Type: block with a bone name.

Values: the name of a joint bone in the model; inside it `limits`, `speed`, `speed2` and `terminator`.

Does: sets how a turret, gun or other joint bone moves when the game aims or animates it.

Limits: `speed` or `limits` on a bone the model does not declare as a joint stops the load with "unexpected token";
on a bone the model lacks, the game logs a warning.

Example:
```
{bone "turret" {speed 0.008}}
{bone "gun_rot" {limits -5 50} {speed 0.004}}
```

See: [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### limits

Where: inside `{bone}`.    Type: numbers; degrees for a rotating bone, metres for a sliding one.

Values: a low and a high value, such as `-10 25`; no numbers means unlimited. Vanilla also writes a single number
(`{limits 10}`), whose meaning is not described.

Does: the range the bone may move through.

Limits: see [bone](#bone).

Example:
```
{bone "gun_rot1" {speed 0.003} {limits -7 7}}
```

See: [speed (bone)](#speed-bone); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### speed (bone)

Where: inside `{bone}`.    Type: number.

Values: vanilla turret values range around 0.003 to 0.03. The value times 50 gives radians per second: 0.0028 is
about 8 degrees per second, 0.0006 about 1.7, 0.03 about 86.

Does: how fast the bone moves.

Limits: a value below 0.0002 stops with the error "Zero speed in ik-bone".

Example:
```
{bone "turret" {speed 0.011}}
```

See: [speed2](#speed2); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### speed2

Where: inside `{bone}`.    Type: number, degrees per second (or metres per second for a sliding bone).

Values: vanilla uses 80.

Does: the bone speed in plain units, an alternative to `speed`.

Limits: none recorded.

Example:
```
{bone "mgun" {limits 10} {speed2 80}}
```

See: [speed (bone)](#speed-bone); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### terminator

Where: inside `{bone}`.    Type: flag.

Values: present or absent.

Does: stops the chain of moving bones at this bone, so aiming does not pass on to the bones above it.

Limits: none recorded.

Example:
```
{bone "gun" {terminator}}
```

See: [bone](#bone); [chapter 16, section 5](16-effects-sound-models.md#5-model-files); [Part I: Edit a model or an animation](p06-edit-a-model.md).

## The foot chassis (soldiers and animals)

Soldiers do not use `Locomotion`. They use a speed table in `{Chassis "foot"}` in `properties/human.ext`. Each row is
three numbers: the speed in km/h, the speed in km/h the animation was made for (the animation plays faster or slower
in proportion), and the largest turn rate in degrees per second. Changing this file changes every soldier.

The final speed of a soldier is the row speed times his `speed` ability or perk, times `Injured` when his health is
below 30 percent, times the terrain speed factor.

### Run

Where: inside `{Chassis "foot"}`.    Type: block of rows.

Values: rows `Sneak`, `Spot`, `Walk`, `Slow`, `Normal`, `Fast`, `Bow`. Vanilla: Sneak 5, Spot 6, Walk 8, Slow 8,
Normal 15, Fast 25, Bow 18.5 km/h; turn rates 200 to 400. Built-in values for missing rows: Run Slow 2, Normal 5,
Fast 9, Walk 2, Spot 2, Sneak 1, Bow 9 km/h.

Does: the upright and crouched speeds. Running uses Slow, Normal and Fast; the other rows are the walking gaits.

Limits: none recorded.

Example:
```
{Run {Sneak 5 2 200} {Walk 8 2 200}
     {Slow 8 7 400} {Normal 15 7 400} {Fast 25 7 400} {Bow 18.5 7 400}}
```

See: [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types).

### Crawl

Where: inside `{Chassis "foot"}`.    Type: block of rows `Slow`, `Normal`, `Fast`.

Values: vanilla 4, 5 and 7 km/h, turn rates 100 to 200. Built-in values for missing rows 1, 2 and 5.

Does: speeds while lying.

Limits: none recorded.

Example:
```
{Crawl {Slow 4 5 100} {Normal 5 5 200} {Fast 7 5 200}}
```

See: [Run](#run); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### Swim

Where: inside `{Chassis "foot"}`.    Type: block of rows `Slow`, `Normal`, `Fast`.

Values: vanilla 2, 3 and 5 km/h. Built-in values for missing rows 1, 2 and 5.

Does: speeds while swimming.

Limits: a soldier swims only on water ground types (`shallow_water`, `water`, `deep_water`); a swim request on land is
ignored. A dead body in water sinks.

<!-- goh: GHMOV-34 -->
Gates of Hell: on `shallow_water` a soldier neither swims nor lies down (a lying soldier stands up there); he swims only
on `water` and `deep_water`.

Example:
```
{Swim {Slow 2 5 200} {Normal 3 5 200} {Fast 5 5 200}}
```

See: [Terrain](#terrain); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### Strafe

Where: inside `{Chassis "foot"}`.    Type: block of rows `Forth`, `Back`, `Left`, `Right`.

Values: each row is five numbers and two animation names. The first number is a distance in metres, the fourth a speed
in km/h, and the names are the "up" and "down" animations. The vanilla comment calls the second and third numbers a
mask and a value for the strafe counter.

Does: when a soldier's path has only two points and is shorter than a row's distance, he may walk it sideways or
backwards with that row's animations instead of turning.

Limits: at most six rows. A seventh row stops the game with `Too many strafe motions`.

Example:
```
{Strafe
  {Forth 3 2 0 6.5 3 "walk_spot_gun_up_1" "walk_spot_gun_down_1"}
  {Back  8 0 0 10.5 1.22 "run_back_spot_gun_up" "run_back_spot_gun_down"}}
```

See: [Run](#run); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### Injured

Where: inside `{Chassis "foot"}`.    Type: number, a factor.

Values: vanilla 0.75.

Does: multiplies a soldier's speed while his health is below 30 percent of his maximum. Being wounded changes speed
only; the wounded idle animations are chosen separately.

Limits: none recorded.

Example:
```
{Injured 0.75}
```

See: [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death); [chapter 7, section 3](07-units-vehicles-movement.md#3-chassis-types).

## Pathfinding profiles

A pather profile tells the game how one class of unit sees the map: which ground it may cross, how much each ground
slows it, how steep it may climb, and how wide it is. Profiles live in `set/pather.set`. The first profile in the file
is the default.

### PatherID

Where: entity `.def` or class `.ext`, top level.    Type: text, a profile name.

Values: a `{Profile}` name from the winning `set/pather.set`. Vanilla names: `human`, `human_flying`, `animal`, `tank`,
`tank.light`, `amphibia`, `armored`, `vehicle.large`, `vehicle.small`, `moto`, `cannon.large`, `cannon.small`,
`cannon.carried`, `cannon.micro`, `airborne`, `railway`, `shallow_water`, `shallow_water_0`, `water`, `deep_water`,
`deep_water_0`.

Does: picks the pathfinding profile of the unit.

Limits: an unknown name logs `ERROR "Unit: Wrong pather name"` when the entity is used and the unit fails to load. A
mod may add its own profile to its copy of `pather.set`.

<!-- goh: GHHUM-18 GHDC-49 -->
Gates of Hell: soldiers also use the profiles `human_prone` (while lying, when `pather.set` has it) and `human_tpc`
(under direct control); see [Gates of Hell only](#human_prone-and-human_tpc-profiles).

Example:
```
{PatherID "tank"}
```

See: [Profile](#profile); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset).

### Profile

Where: `set/pather.set`, inside `{Pathers}`.    Type: block with a name.

Values: the keys below.

Does: one pathfinding class.

Limits: copy a profile under a new name and point your unit at it, rather than editing a vanilla profile that every
unit of that class shares.

Example:
```
{Profile "tank" {Radius 2.25} {Priority 5} {BattleCrusher}
  {Terrain "road" 1.25 "ground" 0.75 "swamp" 0.5 "water" 0}
  {Height 0 0 1 2 3  -1 -1 -1 -1 -1  -1 -1 -1 -1 -1}}
```

See: [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset).

### Network

Where: inside `{Profile}`.    Type: flag.

Values: present or absent. Vanilla sets it only on `human`.

Does: plans routes on a graph of open areas (cells of 10 m split into free regions) instead of the 1.6 m grid that
vehicles use.

Limits: none recorded.

Example:
```
{Profile "human" {Network} {Human} {Priority 1} {Radius 0.3}}
```

See: [Human](#human); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset).

### Human

Where: inside `{Profile}`.    Type: flag.

Values: present or absent.

Does: turns on free-spot search and avoidance of other units: when the target spot is taken, the unit looks for a
free spot in rings around it.

Limits: none recorded.

Example:
```
{Profile "human" {Network} {Human}}
```

See: [Network](#network); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset).

### LinearPath

Where: inside `{Profile}`.    Type: flag.

Values: present or absent. Vanilla sets it on `railway`.

Does: the unit only moves in straight lines; no route search is made.

Limits: none recorded.

Example:
```
{Profile "railway" {LinearPath} {Radius 1.5} {Priority 6}}
```

See: [Priority](#priority); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset).

### BattleCrusher

Where: inside `{Profile}`.    Type: flag.

Values: present or absent. Vanilla sets it on `tank` and `amphibia`.

Does: a unit with this profile may plan through obstacles marked `flag_crush_in_battle` (in vanilla only `building`) once
it has seen enemy contact. Its moving tracks also make others give way.

Limits: none recorded.

Example:
```
{Profile "tank" {Radius 2.25} {Priority 5} {BattleCrusher}}
```

See: [flag_crush_in_battle](#flag_crush_in_battle); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset).

### SkipImpregnable

Where: inside `{Profile}`.    Type: flag.

Values: present or absent. Vanilla sets it on `airborne`.

Does: obstacles of impregnable entities do not block this profile.

Limits: none recorded.

Example:
```
{Profile "airborne" {SkipImpregnable} {Radius 3.25} {Priority 2}}
```

See: [flag_skip_impregnable](#flag_skip_impregnable); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset).

### Priority

Where: inside `{Profile}`.    Type: whole number.

Values: vanilla 0 (animal) to 7 (deep water ships); tank 5, light tank 4, armoured 3, trucks and guns 2, human 1,
railway 6.

Does: when two moving units' paths conflict, the one with the lower priority waits. A crusher always wins; at equal
priority the unit with the higher id wins.

Limits: none recorded.

Example:
```
{Profile "tank.light" {Radius 2.25} {Priority 4}}
```

See: [BattleCrusher](#battlecrusher); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset).

### Radius

Where: inside `{Profile}`.    Type: number, metres.

Values: built-in default 30 units (1.5 m) when absent. Vanilla: human 0.3, tank 2.25, vehicle.large 2, vehicle.small
1.5, cannon.micro 0.6, airborne 3.25, deep water 7.

Does: the clearance the unit keeps from obstacles while planning, and the width of its collision track.

Limits: the vehicle grid cell is 1.6 m, so gaps are never routed more finely than that.

<!-- goh: GHMOV-06 GHMOV-07 -->
Gates of Hell: the vehicle grid cell is 0.8 m and a step costs as much as the most expensive ground it crosses, so vehicles find
gaps half as wide and do not cut across narrow costly strips. The search area around a route is also larger.

Example:
```
{Profile "cannon.carried" {Radius 1.0} {Priority 2}}
```

See: [Profile](#profile); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset).

### Terrain

Where: inside `{Profile}`.    Type: pairs of a ground type name and a speed factor K, with an optional third value.

Values: ground types `undef`, `ground`, `no_pass`, `shallow_water`, `water`, `deep_water`, `swamp`, `road`,
`no_pass_human`. K of 0 (or below 0.00001) makes the ground impassable; 1 means no penalty; between 0 and 1 the unit
moves at K times its speed. The optional third value `0` ("accepted 0") marks the ground as closed to free movement.
A ground type the profile does not list costs nothing, except `undef`, which is impassable.

Does: for each ground type, how fast the unit moves there and how much it costs the planner. The planner cost of a
ground is `1/K - 1`; the speed factor on that ground is `1 / (cost + 1)`, which is K.

Limits: K above 1 is capped at 1, so the vanilla road value 1.25 gives no speed bonus. A profile that leaves out `road`
treats roads as free (cost 0), the same as K 1. A misspelt ground name is read as `undef` and overwrites its cost,
which can open `undef` ground; the log shows `unknown terrain_pp type - X`. `accepted 0` blocks only units moving on
their own (the AI); a player order can still send the unit there. The list of ground types is fixed: a map or mod
cannot add one. Ground materials such as mud, snow or ice have no speed effect; only the ground type does.

<!-- goh: GHMOV-05 GHMOV-21 GHMAP-15 -->
Gates of Hell: the speed on a ground is K, as here, but the planner cost is `1/sqrt(K) - 1`: K 0.5 costs 0.41 (here 1),
K 0.25 costs 1 (here 3). GoH units therefore take mud, sand and shallow water more readily, and GoH `pather.set` values
are tuned for that rule; a profile moved between the games changes routes, not speeds. On impassable ground a unit
that is already there moves at 0.1 of its speed (here 1/11). GoH also has the ground types `snow`, `forest` and
`slope`.

Example:
```
{Terrain "ground" 1 "no_pass" 0 "swamp" 0.25 "shallow_water" 0.7
         "water" 0.4 0 "deep_water" 0.4 0}
```

See: [Height](#height); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### Height

Where: inside `{Profile}`.    Type: 15 numbers.

Values: one cost per slope class. The class is the ground slope in degrees divided by 6 and rounded, from 0 (flat) to
14; class 5 is about 30 degrees and class 10 about 60. A value below 0 blocks that slope, 0 is free, a positive value
adds to the cost.

Does: how steep the unit may plan to climb. Vanilla tanks use `0 0 1 2 3` and then -1, so they do not plan routes over
about 30 degrees. Soldiers use 0 for classes 0 to 6 and -1 above.

Limits: slope does not slow a unit through this table; it only shapes the route. A vehicle's real climb is set by
`MaxSlope`.

Example:
```
{Height 0 0 1 2 3  -1 -1 -1 -1 -1  -1 -1 -1 -1 -1}
```

See: [MaxSlope](#maxslope); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles); [chapter 13, section 5](13-maps.md#5-pathfinding-setpatherset).

## Obstacles

### obstacleID

Where: entity `.def` or class `.ext`, top level.    Type: text, a row name of `set/registry/obstacles.reg`.

Values: vanilla rows `nothing`, `fire`, `human`, `tank`, `marine`, `trench_wall`, `tree`, `unbreakable`, `building`,
`small_building`, `construction`, `stuff`.

Does: decides how this entity blocks the routes of others, through the costs of its row.

Limits: a name missing from the table only logs `No obstacle ID in <entity>`, but later, when a vehicle that can crush
meets the entity, the game crashes. Treat that log line as a crash warning and add every name you use to your mod's
`obstacles.reg`, copying the nearest vanilla row.

Example:
```
{obstacleID "tank"}
```

See: [obstacles.reg rows](#obstaclesreg-rows); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### obstacles.reg rows

Where: `set/registry/obstacles.reg`, inside `{obstacles}`.    Type: block per obstacle name, holding flags and
`{"profile" cost}` pairs.

Values: cost -1 is impassable, 0 is free, a positive number is a flat cost added once per crossing (not scaled by
length). A positive cost means the planner may drive through and break the obstacle. Vanilla examples for a tank: tree
10, trench wall 15, small building 30, stuff 15, building -1.

Does: for each pather profile, what it costs to cross an obstacle of this kind. The costs of an obstacle ignore the
moving unit's own areas, things it carries, units on its `canPush` lists, and moving units more than 10 m away.

Limits: path cost decides the route; physical collision decides what actually breaks on arrival. A mod's
`obstacles.reg` replaces the whole table. A high cost makes long detours; a fence with cost 30 to 100 is driven through.

<!-- goh: GHMOV-13 GHGPL-37 -->
Gates of Hell: a row may carry the flag `flag_vaultable`; see [flag_vaultable](#flag_vaultable).

Example:
```
{tree {"human" -1} {"tank" 10} {"tank.light" 25} {"armored" 50}}
```

See: [Profile](#profile); [collider](#collider); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### flag_damage

Where: inside an `obstacles.reg` row.    Type: flag.

Values: present or absent. Vanilla sets it on `fire`.

Does: the obstacle does not block line-of-movement probe tests.

Limits: none recorded.

Example:
```
{fire {flag_damage} {"human" -1} {"airborne" 0}}
```

See: [obstacles.reg rows](#obstaclesreg-rows); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### flag_human

Where: inside an `obstacles.reg` row.    Type: flag.

Values: present or absent. Vanilla sets it on `human`.

Does: the obstacle blocks strict movers.

Limits: none recorded.

Example:
```
{human {flag_human} {flag_skip_impregnable} {"human" 1}}
```

See: [obstacles.reg rows](#obstaclesreg-rows); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### flag_crush_in_battle

Where: inside an `obstacles.reg` row.    Type: flag.

Values: present or absent. Vanilla sets it only on `building`.

Does: a profile with `BattleCrusher` may plan through this obstacle at cost 0, but only after the unit has seen enemy
contact.

Limits: none recorded.

Example:
```
{building {flag_crush_in_battle} {"tank" -1}}
```

See: [BattleCrusher](#battlecrusher); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

### flag_skip_impregnable

Where: inside an `obstacles.reg` row.    Type: flag.

Values: present or absent.

Does: an impregnable owner does not make this obstacle impassable.

Limits: none recorded.

Example:
```
{human {flag_human} {flag_skip_impregnable}}
```

See: [SkipImpregnable](#skipimpregnable); [chapter 7, section 5](07-units-vehicles-movement.md#5-pathfinding-profiles-and-obstacles).

## Collision profiles

Collision profiles live in `set/colliders.set`. An entity picks one with `{collider "name"}`. The first profile in the
file is the default. A profile may start from another with `from "parent"`, and tag lists inherit: a leading `clear`
empties the inherited list and `-name` removes one name.

### collider

Where: entity `.def` or class `.ext`, top level.    Type: text, a profile name in `set/colliders.set`.

Values: vanilla profiles include `nothing`, `tree`, `bush`, `construction`, `human`, `animal`, `stuff`, `grenade`,
`vehicle`, `moto`, `cannon`, `cannon_small`, `car`, `truck`, `armored`, `tank.light`, `tank.medium`, `tank.heavy`,
`train`, `airborne`, `marine`, `torpedo`. Vehicles get `"vehicle"` from `vehicle.ext`; class files override it.

Does: picks the collision profile.

Limits: an unknown name logs a warning ("collider profile not found") and the default profile is used.

<!-- goh: GHDC-41 GHDC-49 -->
Gates of Hell: `colliders.set` must also hold the profiles `tpc_camera` (the third-person camera) and `human_tpc` (a
soldier under direct control); see [Gates of Hell only](#tpc_camera-and-human_tpc-colliders).

Example:
```
{collider "tank.heavy"}
```

See: [colliderId](#colliderid); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### colliderId

Where: inside a `colliders.set` profile.    Type: text, a group name.

Values: any name. Vanilla groups: `nothing`, `tree`, `bush`, `construction`, `human`, `particle`, `particle.big`,
`flame`, `stuff`, `mine.ap`, `mine.at`, `car`, `moto`, `truck`, `armored`, `tank.light`, `tank.medium`, `tank.heavy`,
`cannon`, `cannon_small`, `sandbag`, `goliath`.

Does: the group this profile belongs to. Other profiles name groups in their `collideWith` and other lists.

Limits: at most 32 distinct group names across the file. A 33rd group gets no slot and its collisions go wrong.

Example:
```
{"tank.light" from "vehicle" {colliderId "tank.light"}}
```

See: [collideWith](#collidewith); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### collideWith

Where: inside a `colliders.set` profile.    Type: list of group names.

Values: group names; `clear` first empties the inherited list, `-name` removes one.

Does: the groups this profile collides with. Two entities collide only when the other's group is in this list.

Limits: none recorded.

Example:
```
{"human" {colliderId "human"} {collideWith "bush" "mine.ap"} {noContactsAtAll}}
```

See: [noContactWith](#nocontactwith); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### noContactWith

Where: inside a `colliders.set` profile.    Type: list of group names.

Values: group names.

Does: overlap events with these groups may still fire, but there is no body contact.

Limits: none recorded.

Example:
```
{noContactWith "particle" "particle.big" "human" "bush" "stuff"}
```

See: [collideWith](#collidewith); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### noContactsAtAll

Where: inside a `colliders.set` profile.    Type: flag (vanilla also writes `{noContactsAtAll 0}`).

Values: present or absent.

Does: the entity is never pushed by contacts. Vanilla soldiers and animals use it.

Limits: because soldiers have it, a vehicle does not shove a soldier physically; running soldiers over is handled by
contact scripts and the vehicle's ram volume (unconfirmed in detail).

Example:
```
{"animal" {colliderId "human"} {noContactsAtAll}}
```

See: [useRamVolume](#useramvolume); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### blocking

Where: inside a `colliders.set` profile.    Type: block with `speed` (km/h) and `penetration` (metres).

Values: vanilla vehicles `{speed 10} {penetration 0.2}`; cannons `{speed 20} {penetration 0.3}`.

Does: when two entities that are not physically simulated meet, a moving unit with this block stops if it is slower
than `speed` relative to the other and less than `penetration` deep into it. Otherwise it is not blocked this way: both
fall into physics and the faster one ploughs on.

Limits: none recorded.

<!-- goh: GHMOV-55 GHMOV-41 -->
Gates of Hell: a contact counts only when the two close in and are deeper than `penetration`, so light grazes are
ignored and resting bodies do not wake each other. A vehicle that hits an obstacle stops dead and stands for a moment
(1 second by default) instead of grinding into it as here.

Example:
```
{blocking {speed 10} {penetration 0.2}}
```

See: [Simulation](#simulation); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### canPush

Where: inside a `colliders.set` profile.    Type: list of group names.

Values: group names. Vanilla medium tanks list `moto car truck armored cannon cannon_small`.

Does: the obstacle areas of enemy units in these groups are ignored by this unit's path planning, so it plans through
them and pushes them.

Limits: none recorded.

Example:
```
{canPush "moto" "car" "truck" "armored" "cannon" "cannon_small"}
```

See: [canPushBroken](#canpushbroken); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### canPushBroken

Where: inside a `colliders.set` profile.    Type: list of group names.

Values: group names.

Does: like `canPush`, for units of these groups that are immobilised.

Limits: none recorded.

Example:
```
{canPushBroken "tank.light" "tank.medium"}
```

See: [canPush](#canpush); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### useRamVolume

Where: inside a `colliders.set` profile.    Type: list of group names.

Values: group names.

Does: contact with these groups uses this unit's `ram` volume.

Limits: none recorded.

Example:
```
{useRamVolume "cannon" "cannon_small" "moto" "car" "truck" "armored"}
```

See: reference 7, [ram volume](r07-armour-volumes-damage.md#ram-volume); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### rejectColliderByVolume

Where: inside a `colliders.set` profile.    Type: flag.

Values: present or absent. Vanilla sets it on grenades, flames, torpedoes and small animals.

Does: listed as a collider flag; its effect is not described.

Limits: none recorded.

Example:
```
{"grenade" from "stuff" {rejectColliderByVolume} {pointCollider}}
```

See: [pointCollider](#pointcollider); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### pointCollider

Where: inside a `colliders.set` profile.    Type: flag.

Values: present or absent.

Does: the entity collides as a point. Vanilla flames and grenades use it.

Limits: none recorded.

Example:
```
{"particle.fire" {pointCollider} {colliderID "flame"}}
```

See: [colliderId](#colliderid); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### noCollideForStable

Where: inside a `colliders.set` profile.    Type: flag.

Values: present or absent.

Does: listed as a collider flag; its effect is not described.

Limits: none recorded.

Example:
```
{"chicken" {colliderID "stuff"} {noCollideForStable}}
```

See: [colliderId](#colliderid); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

## Physics and terrain

### Simulation

Where: entity `.def` or class `.ext`, top level.    Type: block with `able` and `state`.

Values: `{able 1}` lets the entity be physically simulated; `{state 0}` or `{state 1}` is its current state.

Does: allows rigid-body physics: thrown soldiers, cut-off turrets, falling trees, grenades, vehicles that slide off a
slope or crash. A simulated body is capped at 250 m/s; it comes to rest when it barely moves for two 0.2 second checks.

Limits: after physics stops, the entity cannot be simulated again for 0.5 seconds, so a second hit inside that time does
not throw it. A simulated entity without volumes uses a plain box and logs `Simulating entity without volumes`.

<!-- goh: GHMOV-36 GHMOV-56 GHMOV-58 -->
Gates of Hell: a body that falls down again skips the 0.5 second pause; an entity less than 0.5 m above its resting
point is simply put there without a fall; and a body comes to rest by another test (its speed averaged over a second), so
wrecks and grenades settle at other moments than here.

Example:
```
{Simulation {Able 1}}
{simulation {able 1} {state 0}}
```

See: [simulatorId](#simulatorid); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### simulatorId

Where: entity `.def` or class `.ext`, top level.    Type: text.

Values: vanilla uses `human` and `water`; the game also accepts `airborne`.

Does: picks the physics model used when the entity is simulated.

Limits: an unknown name logs `unknown simulator '<name>'`.

Example:
```
{simulatorid "water"}
```

See: [Simulation](#simulation); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

### ground types

Where: painted on the map; named in pather profiles.    Type: fixed list.

Values: `undef`, `ground`, `no_pass`, `shallow_water`, `water`, `deep_water`, `swamp`, `road`, `no_pass_human`.

Does: each cell of the map has one ground type, which the pather profiles turn into speed and cost. A water cell whose
ground is above the water level reads as dry.

Limits: a map or mod cannot add ground types. An unknown type name in `textures.set` stops the
game with `Undefined terrain PP type - X`.

<!-- goh: GHMAP-15 -->
Gates of Hell: the list has three more types, `snow`, `forest` and `slope`. A GoH `textures.set` that names them stops this
game with the error above, so change those names to types of this list when you port.

Example:
```
{Terrain "road" 1.25 "ground" 0.75 "swamp" 0.5}
```

See: [Terrain](#terrain); [chapter 13](13-maps.md); [chapter 7, section 4](07-units-vehicles-movement.md#4-terrain-and-speed).

### terrains.set blocks

Where: `set/interaction_terrain/terrains.set`.    Type: block per ground material.

Values: keys `{effect "x"}` (an effect from `effects/*.inc`), `{physics "y"}` (the material bodies meet when they touch
this ground) and `{pp "type ..."}` (the ground types a painter may pair with this material).

Does: adds ground materials after the built-in ones and gives each its effects and physical material.

Limits: a material has no speed effect; only the ground type does. An unknown name logs
`unknown terrain_fx type - X` or `unknown terrain_pp type - X` and becomes id 0.

Example:
```
{"mud" {effect "mud"} {physics "ground"} {pp "ground swamp"}}
```

See: [ground types](#ground-types); [chapter 7, section 4](07-units-vehicles-movement.md#4-terrain-and-speed).

### slow_on_crush

Where: entity tags.    Type: tag.

Values: present or absent.

Does: when a unit with this tag crushes something, the crushing vehicle is slowed to 0.1 of its top speed for 1.3
seconds.

Limits: none recorded.

Example:
```
{props "slow_on_crush"}
```

See: [canPush](#canpush); [chapter 7, section 6](07-units-vehicles-movement.md#6-orders-and-collisions).

## Not described yet

These keys are read by the game in the blocks of this page, but no source describes what they do. They are listed by
name only.

- Airborne chassis: `airbornemode`, `altitude`, `targetaltitude`, `elevationacceleration`, `maxelevationspeed`,
  `maxsideslope`, `sideslopespeed`, `slope`, `zspeed`.
- Torpedo chassis: `acceleration`, `depth` (its `maxspeed` is the speed key above).
- Human carrier chassis: `carrierbone`, `carrierplace`.
- Railway chassis: `gear`, `links`, `locomotive`, `warmingup`, `brake`, `linkname`, `mode`.
- Switch: `exitfromwater`.
- Track: `animation`, `bone`, `length`, `step`, `view`, `tracer`, `texturescroller`, `textureanimator`.

## Gates of Hell only
<!-- goh: GHMOV-18 GHMOV-20 GHMOV-22 GHMOV-27 GHMOV-28 GHMOV-29 GHMOV-32 GHMOV-60 GHMOV-61 GHMOV-62 GHKEY-11 GHFMT-20 GHFMT-21 GHMOV-13 GHGPL-37 GHHUM-18 GHDC-41 GHDC-49 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you
depend on them.

These keys and names of this page's area exist only in Gates of Hell (GoH). This game does not know them: remove or
replace them when you port a GoH unit, then read `game.log`. The steps of a port are in
[Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md); how the two games differ in movement is summed up in
[chapter 7](07-units-vehicles-movement.md#gates-of-hell-summary).

### helicopter chassis

Where: entity `.def`, `{Chassis "helicopter"}`.    Type: chassis type with its own keys.

Values: `MaxFrontSlope` 15 and `MaxSideSlope` 25 degrees, `FrontSlopeSpeed` and `SideSlopeSpeed` 10, `MaxElevationSpeed`
5, `ElevationAcceleration` 2, `MaxAltitude` 30 m, `TravelAltitude` 15 m, `EngineStartupTime` 3 s (the defaults).

Does: a helicopter. The engine starts on the ground and the helicopter moves after `EngineStartupTime`. On a move order it
flies at the highest ground on its route plus `TravelAltitude`; any height asked for is held between the ground and
`MaxAltitude`. It lands when its fuel runs low, falls when it has no crew in the air, and comes down before it unloads
men. Scripts change its height with the call `chassis/helicopter/RequestAltitude`, which takes `Altitude` (metres),
`KeepAltitude` and `StopEngine`. In a started multiplayer match a bought helicopter appears in the air, except in co-op.

Limits: this game has no helicopter chassis; a GoH helicopter cannot be ported as one.

No stock Gates of Hell file uses it.

See: [Chassis](#chassis); [MaxAirborneAltitude](#maxairbornealtitude).

### MaxAirborneAltitude

Where: `{Chassis "airborne"}`.    Type: number, metres.

Values: 50 when absent.

Does: caps the height a player can give the aircraft by hand. It replaces the console variable `g_maxAirborneAltitude`,
which this game uses for all aircraft at once and GoH no longer has. GoH scripts set an aircraft's height with
`chassis/airborne/SetAltitude`; this game's name for that call is `chassis/airborne/TargetAltitude`.

Limits: drop the key when you port; set the console variable here instead.

Example:
```
{Chassis "airborne" {MaxAirborneAltitude 100}}
```

See: [Chassis](#chassis).

### IgnorePatherBoundsAI

Where: inside `{Chassis}`.    Type: flag.

Values: present or absent.

Does: the chassis may leave the playable map area only while the computer drives it; a player who drives it is kept
inside. Meant for aircraft that fly in from off the map.

Limits: this game knows only [IgnorePatherBounds](#ignorepatherbounds), which frees the unit whoever drives it.

Example:
```
{Chassis "airborne" {IgnorePatherBoundsAI}}
```

See: [IgnorePatherBounds](#ignorepatherbounds).

### NoLink

Where: `{Chassis "railway"}`.    Type: whole number (the editor shows it as `no_link`).

Values: any number other than 0 switches it on.

Does: the railway car never couples to another car when they touch.

Limits: this game's railway chassis does not read it.

Form:
```
{Chassis "railway" {NoLink 1}}
```

No stock Gates of Hell file uses it.

See: [Chassis](#chassis).

### BoostFactor

Where: the movement block of a vehicle chassis.    Type: number.

Values: any number.

Does: nothing; GoH reads the value and drops it.

Limits: this game rejects it as an unknown key. Delete it when you port.

No stock Gates of Hell file uses it.

See: [Locomotion](#locomotion).

### roller_NN bones

Where: model skeleton of a tracked vehicle.    Type: bone names `roller_01`, `roller_02` and on, each with
`roller_NN_joint`.

Values: two digits, from `01`; the list stops at the first missing number. Each has its own `radius` parameter.

Does: every road wheel follows the ground on its own.

Limits: this game reads only one `roller` and one `roller_joint` (see [roller and roller_joint](#roller-and-roller_joint)).

Example:
```
{bone "roller_01" {parameters "radius=0.32;"}}
```

See: [roller and roller_joint](#roller-and-roller_joint).

### suspension bone

Where: model skeleton of a wheeled vehicle, as the parent bone of a wheel.    Type: bone named exactly `suspension`.

Values: a bone with one moving axis; it moves at most 0.3 m each way at 2 m/s unless the bone's own settings say
otherwise.

Does: the wheel under it rides the ground: each step the bone moves to where the wheel touches. The vehicle counts as
moving while one of these bones moves.

Limits: in this game the bone is an ordinary bone and the wheel stays fixed.

No stock Gates of Hell file uses it: the few stock bones named `suspension` hold a hit volume and no wheel.

See: [wheel bones](#wheel-bones).

### trailer_medium and trailer_heavy

Where: entity tags.    Type: tags, with `tractor_medium` and `tractor_heavy` on the towing vehicle.

Values: present or absent.

Does: a `trailer_medium` needs a `tractor_medium` or `tractor_heavy` to tow it; a `trailer_heavy` needs a
`tractor_heavy`.

Limits: the tags do nothing in this game.

Example:
```
{props "trailer_heavy"}
```

See: [tractor and trailer](#tractor-and-trailer).

### flag_vaultable

Where: an obstacle row.    Type: flag.

Values: present or absent. GoH obstacle names that use it: `small_building_vaultable`, `unbreakable_vaultable`,
`construction_vaultable`.

Does: a soldier may plan his path over the obstacle (a fence, a low wall) when he crosses it nearly head on, within 45
degrees of straight, at the obstacle's normal cost. Walking along it or standing on it is still blocked. When he
reaches it facing it, he plays the animation `getover_middle` and goes on from the far side.

Limits: this game has no vaulting. A ported object that names one of the `_vaultable` obstacles gets no obstacle id,
which can crash the game when a tank crushes it (see [obstacleID](#obstacleid)): add those names to your
`obstacles.reg` as copies of their base rows.

Example:
```
{small_building_vaultable
  {flag_vaultable}
  {"human" 5}
  {"human_prone" -1}
}
```

See: [obstacles.reg rows](#obstaclesreg-rows).

### human_prone and human_tpc profiles

Where: `set/pather.set`.    Type: profile names.

Values: `human_prone` is used while a soldier lies down, if the file has it; `human_tpc` while he is under direct
control.

Does: lets lying soldiers and soldiers under direct control path by their own rules.

Limits: when `human_prone` is missing nothing changes. In this game soldiers always use `human`.

Example:
```
{Profile "human_tpc"
  ("humanprofile")
  {Radius 0.4}
}
{Profile "human_prone"
  ("humanprofile")
}
```

See: [PatherID](#patherid); [Profile](#profile).

### tpc_camera and human_tpc colliders

Where: `set/colliders.set`.    Type: profile names.

Values: `tpc_camera` for the third-person camera, `human_tpc` for a soldier under direct control.

Does: the third-person camera stops at walls, the ground and volumes of `tpc_camera` colliders. A soldier taken under
direct control gets the `human_tpc` collider and gets his normal one back when control ends.

Limits: a GoH `colliders.set` without `tpc_camera` probably crashes GoH at the first camera hit. This game does not use
either name.

Example:
```
{"human_tpc" from "human"}
{"tpc_camera"
  {ColliderId "tpc_camera"}
  {CollideWith "construction" "sandbag" "cannon" "cannon_small" "moto" "car" "truck" "armored" "tank.light" "tank.medium" "tank.heavy"}
}
```

See: [collider](#collider).

### squads.set placer keys

Where: `set/squads.set`, block `squads`, inside `{competitive}` or `{cooperative}`.    Type: numbers.

Values: `placerMin`, `placerMax`, `placerRadius`, `placerCommanderAhead`; Gates of Hell data sets 3, 9, 20 and -8 in
both blocks. This game keeps these as fixed values:
competitive 4, 6, 12 and -4; other games 1.7, 4.5, 7 and 0.

Does: how far apart the men of a squad stand when the squad moves into place.

Limits: an unknown first block in this file is a GoH fault that can crash GoH. This game does not read the file.

Example:
```
{squads
  {competitive
    {placerMin 3.0}
    {placerMax 9.0}
    {placerRadius 20.0}
    {placerCommanderAhead -8}
  }
}
```

See: [Run](#run); [chapter 8](08-infantry-and-humans.md).
