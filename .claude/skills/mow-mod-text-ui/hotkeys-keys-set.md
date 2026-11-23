# mow-mod-text-ui: hotkeys and keys.set

When: "change a default hotkey", "bind a key to my new button", "my key does nothing", "ship key bindings with my mod", "what is the key name for the middle mouse button".

## Format
`{keys {"group/action" {value <key>} [{noedit}] [{single}]} ...}`
- the full string `group/action` is the action id and the options title key `options/keys/<id>`; the group is only a naming prefix
- `value`: a bare name (`KEY_K`) or a quoted combo (`"SHIFT + KEY_F"`); `noedit` = locked; `single` = no modifiers (hold keys)
- names: `KEY_A..Z`, `KEY_0..9`, `KEY_F1..F15`, `KEY_NUMPAD0..9`, `KEY_SPACE`, `KEY_TAB`, `KEY_ESC`, `KEY_ENTER`, arrows, punctuation names ..; modifiers `SHIFT CTRL ALT DOUBLE`, negatives `~SHIFT ~CTRL ~ALT ~DOUBLE` (must not be held)
- mouse: `MOUSE0`/`MOUSE_LEFT`, `MOUSE1`/`MOUSE_RIGHT`, `MOUSE2`/`MOUSE_MIDLE` (sic). `MOUSE_MIDDLE` is NOT in the table (lim UI-12)
- full token list:; ids the game reads (`common/..`, `control_manual/..`, `control_camera/..`, `control_human/..`, `multiplayer/..`, `groups/..`, `actions/..`):

## Where the file comes from
- the game loads the default map `@/profiles/default/keys.set` first, then the player's `@/profiles/<id>/keys.set`, which overrides every action it lists; `@` = the user folder. The game rewrites the player's file
- mod route: `interface/profiles/default/keys.set` (PLURAL `profiles`); it reaches the user folder only through the start-up copy. Whether it overwrites an existing user copy is unverified [T] (lim UI-13). Singular `interface/profile/..` is never looked up
- so: a mod can offer defaults, it can not force a player's keys; a player who already has a binding keeps it
- a mod's `interface/profiles/default/settings.set` is never read (lim UI-18 [V, T in game])

## What can and can not get a key
- only built-in actions and actions whose `button` is `use` get a hotkey and a key badge. A custom `interface/action/<name>.set` action can not be bound (lim UI-14 [V])
- a new id in `keys.set` is stored and shown in the options screen, and nothing reads it (lim UI-15)
- select / command mouse buttons are fixed in code

## Steps
1. read the player's current keys (read only): MCP `mow_settings_info` (`what: "keys"`, `filter: "control_manual"`)
2. read the game's default file: MCP `mow_file_which` (`path: "interface/profiles/default/keys.set"`, `mods`), then open that source
   CLI `node tools/vfs/vfs.js G --exe as64|mowas_2|mowas2|goh --mods a,b which interface/profiles/default/keys.set`
3. put a full copy in the mod at `resource/interface/profiles/default/keys.set` and change the values (whole-file override: keep every entry)
   GUI: Editor page, file view Game → "Copy into my mod" → edit → Save (AS2 tabs only)
4. lint: MCP `mow_mod_check` (`mod`, `only: "uilint"`)
   CLI `node tools/uilint/uilint.js <mod> [--game G] [--exe as64|mowas_2|mowas2|goh]`
   codes: KEYS_TOKEN_UNKNOWN (UI-11), KEYS_MOUSE_MIDDLE (UI-12), KEYS_PATH_UNREACHED (UI-13), KEYS_ACTION_NO_HOTKEY (UI-14), WARN_KEYS_ID_UNREAD (UI-15); info KEYS_PROFILE_OVERRIDE, KEYS_CATEGORY_IGNORED
5. the options screen label of an id: text key `options/keys/<id>`: MCP `mow_text_set` (`mod`, `key`, `text`)

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| key ids | `common/..` etc. as above | same | `common/*` is gone: moved to `interface/..`, `actions/toggle_attack`, `control_camera/center_active`, `groups/dismiss_squad` (GHUI-36); many new ids (GHUI-37) |
| hotkey for an own action | no (UI-14) | no | yes: a `{Key "id"}` in the action file takes the key bound under that id (guide p08; uilint GoH rules) |
| `{"category" ..}` in keys.set | ignored (info) | ignored | rebind conflicts only inside one category (GHUI-251) |
| user folder | shared AS2 profile | same profile | its own; see `mow_game_status` |
All GoH rows: untested, not run in game.

## Silent fails
- UI-11 an unknown key token is ignored: the action keeps only its modifiers or is unbound. (In a `.ps` `{on key "x"}` it is fatal: `Invalid key for bind`)
- UI-12 `MOUSE_MIDDLE` leaves the action unbound
- UI-13 the mod's defaults do not show for a player with a saved profile
- UI-15 a new id shows in options and does nothing
- a `keys.set` copied between AS2 and GoH leaves keys unbound with no error (GHUI-36)

## Verify
- uilint clean; in game with a FRESH profile: options → controls shows the new default, and the key acts in a match (→ skill `mow-mod-test`; never delete the user's profile, use a test instance)

Depth: · guide 15 (6. Hotkeys), r09-interface-and-localization (keys)
