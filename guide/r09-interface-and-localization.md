# Reference 9: Interface and Localization

This chapter lists the data keys of the interface: action files, command panel layouts, hotkeys, fonts, HUD settings, menu backgrounds, skins and page scripts. It also lists the rules of `.lng` text files, the text formatting tags, and the text keys the game asks for. [Chapter 15](15-interface-and-icons.md) teaches the interface and [chapter 14](14-localization.md) teaches localization; this chapter is the lookup table.

## How to read this chapter

All the files here are SDL text files: plain text made of nested blocks in curly braces, with `;` starting a comment. Text files must be saved as UTF-8 with Windows line endings (CRLF). Names and identifiers stay plain ASCII.

The screens themselves are built into the game program. Data can change pictures, actions, panel layouts, keys, fonts, colours, skins, menu backgrounds and a few page scripts, but it cannot add new screens, move the command grid or resize the purchase panel.

A colour is written in one of three ways, depending on the file: a colour name such as `white`, `red`, `dyellow` or `dgreen`; a quoted `"r g b"` text with values from 0 to 255, sometimes with a fourth alpha value; or a hexadecimal `0xAARRGGBB` number, where AA is the opacity.

## Action files

Taught in [chapter 15, section 4](15-interface-and-icons.md#4-actions). The job: [Icons and interface](p08-icons-and-interface.md).

An action is one order a unit can be given, such as repair or throw a grenade. Each action can have a file at `interface/action/<name>.set`. When the name matches an action built into the game, the file configures that action. Any other name creates a new custom action, named after the file. Custom actions run a list of instructions, described under `instructions` below.

The built-in actions are: `none`, `select`, `disable`, `move`, `rotate`, `cover`, `accelerate`, `cancel`, `drop`, `pour_in`, `pour_out`, `fortification`, `board`, `emit`, `enter`, `repair`, `collect`, `examine`, `care`, `injection`, `attach`, `detach`, `reinforce`, `throw_ap_grenade`, `throw_at_grenade`, `throw_sk_grenade`, `aimed_shot`, `bazooka_shot`, `suppression_fire`, `advance`, `attack`, `attack_ground`, `attack_melee`, `heal`, `medic`, `call_ally`, `mine`, `barricade`, `barbwire` and `hedgehog`.

The game numbers actions in the order it creates them and sends those numbers in multiplayer orders. The host and every client must therefore load exactly the same set of action files, or orders arrive as the wrong action.

### action
Where: action file, root block.    Type: block.
Values: holds the keys below; an empty `{action}` keeps every default.
Does: Holds the settings of one action. Keyword names inside it are not case-sensitive.
Limits: A file that names no built-in action creates a new custom action, even if you only meant to change an existing one and misspelt its name.
Gates of Hell: `barricade`, `barbwire` and `hedgehog` are no longer built in; every fortification is one `{action "name"}` block of `interface/action/fortify.set`. New built-in actions are `airstrike`, `teleport`, `mine_ap` and `mine_at`, and `repair` can be configured like a custom action (not confirmed).
Example:
```
{action
    {cursor}
    {button}
    {fx "flashblue"}
}
```
See: [chapter 15, section 4](15-interface-and-icons.md#4-actions).

### cursor
Where: action file, inside `{action}`.    Type: word, an optional quoted cursor name and an optional second name.
Values: a folder name under `interface/cursor/`; without a name, the action's own name is used.
Does: Sets the mouse cursor shown while the action is chosen. A second name gives the cursor shown at a position.
Limits: A cursor name with no folder shows no cursor and logs nothing.
Gates of Hell: the pick-up action shows its second cursor over an item when the inventory has room for it, so the second name works as a "room" hint there.
Example:
```
{action
    {cursor "use"}
}
```
See: [`button`](#button).

### button
Where: action file, inside `{action}`.    Type: word, an optional quoted picture name.
Values: a picture name under `interface/scene/panel_control/`, which may include a subfolder; without a name, the action's own name is used.
Does: Sets the picture of the action's command panel button.
Limits: Leaving the key out entirely gives the button a placeholder picture. A picture name with no file also shows the placeholder and logs nothing.
Example:
```
{action
    {cursor}
    {button "repair"}
}
```
See: [Icon folders and frames](#icon-folders-and-frames).

### fx
Where: action file, inside `{action}`.    Type: text, a ground effect name.
Values: an effect name such as `"flashred"`, `"flashgreen"` or `"flashblue"`.
Does: Plays a ground effect where you click when you give the order.
Limits: None known.
Gates of Hell: adds `FxEntity`, which shows a model at the point you click instead; see [Gates of Hell only](#gates-of-hell-only).
Example:
```
{action
    {cursor}
    {fx "flashgreen"}
}
```
See: none.

### item
Where: action file, inside `{action}`.    Type: text, item tags.
Values: a text of item tags; when absent, the action uses the item in the unit's right hand.
Does: Makes the action need an inventory item that has all the tags.
Limits: None known.
Example:
```
{action
    {item "matchbox"}
    {item_in_box}
}
```
See: [`item_in_box`](#item_in_box).

### item_in_box
Where: action file, inside `{action}`.    Type: flag, no value.
Values: present or absent.
Does: Lets the required item be anywhere in the inventory instead of in the hand.
Limits: None known.
Example:
```
{action
    {item "matchbox"}
    {item_in_box}
}
```
See: [`item`](#item).

### ShowCount
Where: action file, inside `{action}`.    Type: flag, no value.
Values: present or absent.
Does: Shows the number of the required items on the button.
Limits: None known.
Gates of Hell: the badge text comes from `actionbar/count_white`, not `actionbar/count_black`.
Example:
```
{action
    {button}
    {ShowCount}
}
```
See: [`actionbar/count_black`](#actionbarcount_black).

### apply_to_all
Where: action file, inside `{action}`.    Type: flag, no value.
Values: present or absent.
Does: When a squad commander is selected, applies the action to the whole squad.
Limits: None known.
Example:
```
{action
    {cursor}
    {apply_to_all}
}
```
See: none.

### target
Where: action file of a custom action, inside `{action}`.    Type: word with arguments.
Values: `ground`; `entity ["tags"]`, optionally followed by `volume "name"`; or `volume "name"` optionally followed by `able <ability>`.
Does: Sets what the custom action can be used on: a point on the ground, an object with the tags, or a named volume of an object. `able` limits a volume target to volumes with that ability, such as `contact` or `touch`.
Limits: The abilities are the ones listed under [`volume`](r10-interaction-scripts.md#volume) in Reference 10; this game has no `blockcamera`.
Gates of Hell: also knows the volume ability `blockcamera`, and `able blockcamera` filters work there.
Example:
```
{action
    {target volume "dynamite_activate" able contact}
    {cursor "use"}
}
```
See: [Reference 10, `volume`](r10-interaction-scripts.md#volume).

### instructions
Where: action file of a custom action, inside `{action}`.    Type: block of instructions.
Values: instruction blocks from the list under "Not described yet".
Does: Lists the steps the unit carries out, in order, as an order when you use the action.
Limits: An instruction name the game does not know logs "Unknown instruction" and then crashes the game.
Gates of Hell: `plant` does nothing there and logs that it is not implemented; `install` takes only the object and an optional turn in degrees (the distance and `exact_placement` words are gone); `animations` takes a `paint` word that this game rejects as an unexpected token. New instructions are listed under [Gates of Hell only](#gates-of-hell-only).
Example:
```
{instructions
    {bind volume "dynamite_activate"}
    {effect_object "switch"}
}
```
See: [`instant`](#instant).

### instant
Where: action file of a custom action, inside `{action}`.    Type: block of instructions.
Values: instruction blocks.
Does: Runs the instructions at once when the action is chosen, without an order.
Limits: It only runs when exactly one unit is selected.
Example:
```
{instant
    {effect "switch"}
}
```
See: [`instructions`](#instructions).

## Command panel layouts

Taught in [chapter 15, section 5](15-interface-and-icons.md#5-the-command-panel). The job: [Icons and interface](p08-icons-and-interface.md).

The command panel is the grid of order buttons. Its main part has 4 columns and 3 rows, 12 cells. The layouts are in `set/panel_control/`: `right_main.set` is the normal page, `right_attack.set` the attack page and `right_useitem.set` the item page. A file `right_special.set` is named by the game but never loaded, so it has no effect.

Besides action names, a panel may list these built-in item types: `gc_cp_command_use`, `gc_cp_command_cancel`, `gc_cp_state_manual_control`, `gc_cp_state_inventory`, `gc_cp_state_objectives`, `gc_cp_state_message_history`, `gc_cp_state_map`, `gc_cp_state_map_control`, `gc_cp_state_map_zoom_in`, `gc_cp_state_map_zoom_out`, `gc_cp_leave_unit`, `gc_cp_state_smoke_decoy`, `gc_cp_game_menu`, `gc_cp_state_highlight_stuff`, `gc_cp_state_highlight_corpses`, `gc_cp_state_highlight_silhouettes`, `gc_cp_state_pose`, `gc_cp_state_fire`, `gc_cp_state_move`, `gc_cp_state_speed`, `gc_cp_state_cannon`, `gc_cp_squad_control`, `gc_cp_state_weapon`, `gc_cp_state_reload`, `gc_cp_state_attach`, `gc_cp_state_supply`, `gc_cp_browse_attack`, `gc_cp_browse_useitem`, `gc_cp_browse_special`, `gc_cp_browse_back` and `gc_cp_dummy`. The `gc_cp_browse_` items switch the panel to another page, and `gc_cp_dummy` is an empty button. The others are the built-in buttons their names describe; the game draws and runs them itself.

### panel_control
Where: panel layout file, root block.    Type: block.
Values: one child block per item.
Does: Holds the items of one panel page, in order.
Limits: None known.
Gates of Hell: loads six lists, `front`, `right_main`, `right_attack`, `right_useitem`, `right_special` and a new `right_emplacement`, so `right_special.set` works there. Its battle screen draws the buttons in layout bars whose grid the layout file sets (3 by 3 when not set) instead of the fixed 4 by 3 grid.
Example:
```
{panel_control
    {gc_cp_state_fire
        {position 0 0}
    }
}
```
See: [chapter 15, section 5](15-interface-and-icons.md#5-the-command-panel).

### <item name>
Where: panel layout file, child block of `{panel_control}`.    Type: block named after an action or a built-in item type.
Values: an action name, built-in or from an action file, or one of the built-in item types above. The block may be empty.
Does: Puts that button on the panel page. A button with no position takes the first free cell, row by row, in file order.
Limits: A name that is neither an action nor a built-in item type logs "Unknown control panel item" and leaves a button that does nothing; on the minimap panel the same mistake crashes the game. Every name is checked each time a panel is built, so one bad name gives many warnings. An action button only appears when the selected units can do the action.
Gates of Hell: has more item types (`gc_cp_state_auto_medic`, `gc_cp_state_hatch`, `gc_cp_state_reverse`, `gc_cp_lock_ammo`, `gc_cp_state_altitude`, `gc_cp_state_manual_control_mode`, `gc_cp_browse_emplacement`); copied into this game they become buttons that do nothing.
Example:
```
{panel_control
    {rotate
        {position 2 1}
    }
}
```
See: [`position`](#position), [`condition`](#condition).

### position
Where: panel layout file, inside an item block.    Type: two whole numbers, column and row.
Values: column 0 to 3, row 0 to 2; when absent, -1 -1, which means the first free cell.
Does: Places the button in a fixed cell.
Limits: When two items claim the same cell, the first one listed wins and the other is hidden. Items without a position are hidden when all 12 cells are taken.
Example:
```
{gc_cp_browse_attack
    {position 0 1}
}
```
See: [`priority`](#priority).

### condition
Where: panel layout file, inside an item block.    Type: one or more quoted words.
Values: the condition terms below; when absent, no condition.
Does: Shows the button only for selections that meet every term.
Limits: An unknown term stops the game with the error "Unknown condition term" when the panel is built. Without `disabled`, a button whose action is unavailable is hidden, which includes every action button while you control a unit directly.
Gates of Hell: the order panels also know the terms `helicopter`, `hatch` and `engine`, and `-<tag>` hides the button when a selected unit has that tag. Its layout bars match any unit tag or a soldier's ability name, such as `medic` or `barricade`, hide the button without a log message when a term is unknown, and log "ambiguous condition term" when a term matches two ways.
Example:
```
{gc_cp_state_pose
    {position 2 0}
    {condition "human"}
}
```
See: [condition terms below](#panel-condition-terms).

### priority
Where: panel layout file, inside an item block.    Type: whole number.
Values: any whole number; default 0.
Does: Decides which item is placed first when two items want the same cell; the lower number goes first.
Limits: None known.
Example:
```
{repair
    {position 3 0}
    {priority 1}
}
```
See: [`position`](#position).

### browse
Where: panel layout file, inside an item block.    Type: word.
Values: a tag.
Does: Nothing; the game reads it and never uses it.
Limits: It has no effect.
Example:
```
{gc_cp_browse_useitem
    {position 1 1}
    {browse "useitem"}
}
```
See: none.

## Panel condition terms

Taught in [chapter 15, section 5](15-interface-and-icons.md#5-the-command-panel). The job: [Icons and interface](p08-icons-and-interface.md).

### vehicle
Where: panel layout file, inside `{condition}`.    Type: quoted word.
Values: the word itself.
Does: Shows the button only if a selected unit has the `vehicle` tag.
Limits: None known.
Example:
```
{gc_cp_state_speed
    {condition "vehicle"}
}
```
See: [`condition`](#condition).

### tank
Where: panel layout file, inside `{condition}`.    Type: quoted word.
Values: the word itself.
Does: Shows the button only if a selected unit has the `tank` tag.
Limits: None known.
Example:
```
{gc_cp_state_weapon
    {condition "tank"}
}
```
See: [`condition`](#condition).

### cannon
Where: panel layout file, inside `{condition}`.    Type: quoted word.
Values: the word itself.
Does: Shows the button only if a selected unit has the `cannon` tag.
Limits: None known.
Example:
```
{gc_cp_state_cannon
    {position 3 0}
    {condition "cannon"}
}
```
See: [`condition`](#condition).

### tractor
Where: panel layout file, inside `{condition}`.    Type: quoted word.
Values: the word itself.
Does: Shows the button only if a selected unit has the `tractor` tag.
Limits: None known.
Example:
```
{gc_cp_state_supply
    {position 3 0}
    {condition "tractor"}
}
```
See: [`condition`](#condition).

### human
Where: panel layout file, inside `{condition}`.    Type: quoted word.
Values: the word itself.
Does: Shows the button only if a selected unit has the `human` tag.
Limits: None known.
Example:
```
{gc_cp_state_pose
    {position 2 0}
    {condition "human"}
}
```
See: [`condition`](#condition).

### single
Where: panel layout file, inside `{condition}`.    Type: quoted word.
Values: the word itself.
Does: Shows the button only when exactly one unit is selected, counting each squad member.
Limits: None known.
Example:
```
{gc_cp_state_inventory
    {condition "single"}
}
```
See: [`multiple`](#multiple).

### multiple
Where: panel layout file, inside `{condition}`.    Type: quoted word.
Values: the word itself.
Does: Shows the button only when more than one unit is selected, counting each squad member.
Limits: None known.
Example:
```
{gc_cp_squad_control
    {condition "multiple"}
}
```
See: [`single`](#single).

### commander
Where: panel layout file, inside `{condition}`.    Type: quoted word.
Values: the word itself.
Does: Shows the button only when one unit is selected and it leads a squad.
Limits: None known.
Example:
```
{gc_cp_squad_control
    {condition "commander"}
}
```
See: [`apply_to_all`](#apply_to_all).

### disabled
Where: panel layout file, inside `{condition}`.    Type: quoted word.
Values: the word itself.
Does: Shows the button even when its action is unavailable, drawn greyed out.
Limits: None known.
Example:
```
{throw_ap_grenade
    {position 0 0}
    {condition "disabled"}
}
```
See: [`condition`](#condition).

## Hotkeys

Taught in [chapter 15, section 6](15-interface-and-icons.md#6-hotkeys). The job: [Icons and interface](p08-icons-and-interface.md).

The default key map is `interface/profiles/default/keys.set`; note the plural "profiles". The game copies the files in `interface/profiles/` into the player's own profile folder. Each player profile keeps its own `keys.set`, which overrides every action it lists and is rewritten by the game. Whether your mod's default replaces a copy the player already has is unconfirmed.

Key names are written as `KEY_` followed by the key: `KEY_A` to `KEY_Z`, `KEY_0` to `KEY_9`, `KEY_F1` to `KEY_F15`, `KEY_NUMPAD0` to `KEY_NUMPAD9`, `KEY_COMMA`, `KEY_PERIOD`, `KEY_SLASH`, `KEY_BACKSLASH`, `KEY_SEMICOLON`, `KEY_APOSTROPHE`, `KEY_GRAVE`, `KEY_LBRACKET`, `KEY_RBRACKET`, `KEY_MINUS`, `KEY_EQUALS`, `KEY_ESC` or `KEY_ESCAPE`, `KEY_ENTER` or `KEY_RETURN`, `KEY_BACKSPACE` or `KEY_BACK`, `KEY_TAB`, `KEY_SPACE`, `KEY_CAPSLOCK`, `KEY_PAUSE`, `KEY_SYSRQ`, `KEY_HOME`, `KEY_END`, `KEY_INSERT`, `KEY_DELETE`, `KEY_PRIOR` or `KEY_PGUP`, `KEY_NEXT` or `KEY_PGDN`, `KEY_UP`, `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT` (also with `ARROW` added), `KEY_ADD`, `KEY_SUBTRACT`, `KEY_MULTIPLY`, `KEY_DIVIDE`, `KEY_DECIMAL`, `KEY_NUMPADPLUS`, `KEY_NUMPADMINUS`, `KEY_NUMPADSTAR`, `KEY_NUMPADSLASH`, `KEY_NUMPADPERIOD`, `KEY_LSHIFT`, `KEY_RSHIFT`, `KEY_LCONTROL`, `KEY_RCONTROL`, `KEY_LALT`, `KEY_RALT`, `KEY_SHIFT`, `KEY_CONTROL`, `KEY_ALT` (either side), `KEY_LWIN`, `KEY_RWIN`, `KEY_APPS`, `KEY_NUMLOCK`, `KEY_SCROLL` and `KEY_ANY` (any key). Mouse buttons are `MOUSE0` or `MOUSE_LEFT`, `MOUSE1` or `MOUSE_RIGHT`, `MOUSE2` or `MOUSE_MIDLE` (spelt that way), `MOUSE3` and `MOUSE4` for the side buttons, and `MOUSE5` to `MOUSE7`.

The action ids the game reads are:

| Group | Ids after the slash |
|---|---|
| `common/` | center_active, prev_unit, next_unit, toggle_attack, toggle_position, slowdown, stuff_highlight, corpses_highlight, toggle_objectives, toggle_message_history, toggle_equipment, dismiss_squad, toggle_map, toggle_map_control, show_selection_circle, game_menu, pause, screenshot, videocapture, set_commander |
| `control_manual/` | toggle, quick_aim, modify, forward, backward, left, right, fire, next_weapon, fire_mode, next_ammo, next_mgun |
| `control_camera/` | mouse_rotate, zoom_in, zoom_out, rotate_left, rotate_right, increase_view, decrease_view |
| `control_human/` | stay_lie, pose_up, pose_down, drop_from_hands |
| `multiplayer/` | chat_team, chat_all, show_statistics, leave_unit, push_to_talk, toggle_microphone, show_notification |
| `groups/` | assign_1 to assign_9, select_1 to select_9 |
| `actions/` | throw_ap_grenade, throw_at_grenade, throw_sk_grenade, bazooka_shot, attack, attack_ground, attack_melee, heal, emit, cancel, examine, drop, rotate, repair, attach, smoke_decoy, use |

Three of these, `actions/smoke_decoy`, `common/show_selection_circle` and `common/set_commander`, are missing from the shipped default file and so start unbound. Selecting with the left mouse button and ordering with the right one are fixed and cannot be changed in this file.

### keys
Where: key map file, root block.    Type: block.
Values: one block per action id.
Does: Holds the default key of every action.
Limits: None known.
Example:
```
{keys
    {"common/dismiss_squad"
        {value KEY_K}
    }
}
```
See: [chapter 15, section 6](15-interface-and-icons.md#6-hotkeys).

### "group/action"
Where: key map file, child block of `{keys}`.    Type: block named by a quoted action id.
Values: an id from the table above. The part before the slash only groups and sorts the options screen.
Does: Sets the key of that action. The options screen titles it with the text key `options/keys/<id>`.
Limits: An id the game does not read is saved and shown in the options screen but does nothing. Custom actions from action files cannot get a key at all, and show no key badge on their button; only built-in actions and actions whose button is `use` can.
Gates of Hell: most `common/` ids moved to other groups (`interface/pause`, `interface/toggle_map`, `actions/toggle_attack`, `control_camera/center_active`, `groups/dismiss_squad` and others), so an id copied from this game is unbound there; `control_human/stay_lie`, `pose_up`, `pose_down` and `control_manual/next_mgun` are gone. An action file with a `Key` line takes the key bound under that name, so custom actions can have keys.
Example:
```
{"common/center_active"
    {value "SHIFT + KEY_F"}
}
```
See: [`value`](#value).

### value
Where: key map file, inside an action id block.    Type: word or quoted text.
Values: a bare key name, or a quoted combination of key names and modifiers joined with `+`. Modifiers are `SHIFT`, `CTRL`, `ALT` and `DOUBLE` (a double press); `~SHIFT`, `~CTRL`, `~ALT` and `~DOUBLE` mean that modifier must not be held. An empty text `""` leaves the action unbound.
Does: Sets the key or combination for the action. The name is not case-sensitive.
Limits: An unknown name is silently ignored, so a misspelt key leaves only the modifiers or nothing bound. `MOUSE_MIDDLE` is not a known name.
Gates of Hell: its key dialog can also bind the left and right mouse buttons.
Example:
```
{"common/slowdown"
    {value KEY_BACKSPACE}
}
```
See: [key names above](#hotkeys).

### noedit
Where: key map file, inside an action id block.    Type: flag, no value.
Values: present or absent.
Does: Locks the key so the player cannot change it in the options screen.
Limits: None known.
Gates of Hell: the pause key `interface/pause` can always be changed. Each key there also belongs to a `category`; see [Gates of Hell only](#gates-of-hell-only).
Example:
```
{"common/pause"
    {value KEY_PAUSE}
    {noedit}
}
```
See: [`single`](#single-1).

### single
Where: key map file, inside an action id block.    Type: flag, no value.
Values: present or absent.
Does: Makes the action take a key without modifiers, as used for keys you hold down.
Limits: None known.
Example:
```
{"common/stuff_highlight"
    {value KEY_C}
    {single}
}
```
See: [`noedit`](#noedit).

## Fonts

Taught in [chapter 15, section 7](15-interface-and-icons.md#7-fonts-cursors-and-hud-files). The job: [Icons and interface](p08-icons-and-interface.md).

Fonts are files in `interface/font/` ending in `.font`. Each points to a bitmap font description file (`.fnt`, in the binary AngelCode format) whose glyph pages are `<name>_<page>.tga` pictures beside it. Text picks a font by name, size and style; when the exact size is missing the game uses the biggest size not above the wanted one.

### font_atlas
Where: font file, root block.    Type: block.
Values: holds the keys below.
Does: Describes one font at one size and style.
Limits: A font named `main` at size 10 must exist; without it, or with no fonts at all, the game stops at start-up. A character the font lacks is drawn as `?`.
Gates of Hell: the default size is 8, so it needs `main` at size 8 and stops with "No default font" without it. A font set moved between the two games needs both sizes.
Example:
```
{font_atlas
    {name "main"}
    {size 10}
}
```
See: [chapter 15, section 7](15-interface-and-icons.md#7-fonts-cursors-and-hud-files).

### name
Where: font file, inside `{font_atlas}`.    Type: text.
Values: a font family name, such as `main`, `arial_hq`, `arial_narrow`, `bookman` or `impact`.
Does: Names the family the text tag `<f(...)>` asks for.
Limits: None known.
Example:
```
{font_atlas
    {name "impact"}
    {size 21}
}
```
See: [`<f(...)>`](#f).

### size
Where: font file, inside `{font_atlas}`.    Type: whole number.
Values: 0 to 255.
Does: Sets the size the text tag `<s(...)>` asks for.
Limits: Sizes above 255 do not fit the value the game stores.
Gates of Hell: text that asks for size 0 or less gets size 8 instead of 10.
Example:
```
{font_atlas
    {name "main"}
    {size 12}
}
```
See: [`<s(...)>`](#s).

### style
Where: font file, inside `{font_atlas}`.    Type: whole number.
Values: 0 for normal; bold fonts ship as separate files of the same family.
Does: Sets the style of this font file.
Limits: None known.
Example:
```
{font_atlas
    {name "main"}
    {style 0}
}
```
See: [`<b>`](#b).

### binary_data
Where: font file, inside `{font_atlas}`.    Type: text, a file name.
Values: the `.fnt` file beside the `.font` file.
Does: Points to the glyph description of the font.
Limits: None known.
Example:
```
{font_atlas
    {name "main"}
    {binary_data "main_10.fnt"}
}
```
See: none.

## HUD settings

Taught in [chapter 15, section 7](15-interface-and-icons.md#7-fonts-cursors-and-hud-files). The job: [Icons and interface](p08-icons-and-interface.md).

The file `set/interface.set` holds selection colours, the inventory grid, aim cursors, the damage scheme colours and the manual aiming read-out. The file `interface/scene/minimap/minimap.set` holds the minimap colours.

### interface
Where: `set/interface.set`, root block.    Type: block.
Values: holds the blocks below.
Does: Holds the HUD settings.
Limits: None known.
Example:
```
{interface
    {inventory
        {cell_size 31 35}
    }
}
```
See: [chapter 15, section 7](15-interface-and-icons.md#7-fonts-cursors-and-hud-files).

### selection colors
Where: `set/interface.set`, `{interface {selection {colors ...}}}`.    Type: block of colours.
Values: keys `active`, `examining`, `manual`, `selectable`, `selected` and `senseless`, each a colour name or `"r g b"`.
Does: Sets the colour of unit selection marks in each state.
Limits: None known.
Example:
```
{colors
    {selected   white}
    {examining  "0 128 90"}
}
```
See: colours in [How to read this chapter](#how-to-read-this-chapter).

### cell_size
Where: `set/interface.set`, `{interface {inventory ...}}`.    Type: two whole numbers, pixels.
Values: width and height of one cell.
Does: Sets the size of one inventory grid cell.
Limits: None known.
Example:
```
{inventory
    {cell_size 31 35}
}
```
See: none.

### aim_spot
Where: `set/interface.set`, inside `{interface}`.    Type: block of picture paths.
Values: keys `normal`, `ground`, `busy` and `target`, each a cursor path under `/interface/cursor/`.
Does: Sets the aiming cursor pictures.
Limits: A path with no file shows no cursor and logs nothing.
Gates of Hell: scales these pictures to a tenth of their size, so this game's aim pictures look tiny there and Gates of Hell's look ten times too big here.
Example:
```
{aim_spot
    {normal "/interface/cursor/sight"}
    {busy   "/interface/cursor/wpn_busy"}
}
```
See: [`cursor`](#cursor).

### structure colors
Where: `set/interface.set`, `{interface {structure {colors ...}}}`.    Type: block of colours.
Values: keys `work`, `repairing`, `broken` and `destroyed`.
Does: Sets the colour of vehicle parts in the damage scheme for each state.
Limits: None known.
Gates of Hell: adds a `vehicle_view` block that colours its vehicle panel by percent of health; whether it still reads this block is not confirmed. See [Gates of Hell only](#gates-of-hell-only).
Example:
```
{colors
    {work      white}
    {destroyed "80 80 80"}
}
```
See: none.

### manual_targetting
Where: `set/interface.set`, inside `{interface}`.    Type: block.
Values: a `range` block with `show`, `offset x y`, `size w h`, and colours `invalid`, `satisfy` and `optimal`; further sub-blocks are listed under "Not described yet".
Does: Sets the range read-out shown while you aim a unit by hand: whether it shows, where and how big, and its colour when the target is out of range, in range, or at the best range.
Limits: None known.
Gates of Hell: the block is spelt `manual_targeting` there, with one `t`; the old spelling is not read, so every read-out stays off until you rename it. It also adds an `accuracy_circle` block.
Example:
```
{range
    {show}
    {offset 40 10}
    {invalid red}
}
```
See: none.

### minimap settings
Where: `interface/scene/minimap/minimap.set`, `{minimap {settings ...}}`.    Type: block of numbers.
Values: `tracer_length`, a number; `max_tracers`, a whole number.
Does: Sets how long shot tracers are drawn on the minimap and how many may show at once.
Limits: None known.
Example:
```
{settings
    {tracer_length 0.9}
    {max_tracers   100}
}
```
See: [`minimap colors`](#minimap-colors).

### minimap colors
Where: `interface/scene/minimap/minimap.set`, `{minimap {colors ...}}`.    Type: block of `0xAARRGGBB` numbers.
Values: keys `neutral`, `self`, `ally`, `coop_ally`, `enemy`, `selected`, `friendly_tracer` and `enemy_tracer`.
Does: Sets the minimap colour of units by side and of tracers.
Limits: None known.
Example:
```
{colors
    {enemy 0xffE10000}
    {self  0xff004BE1}
}
```
See: [`minimap settings`](#minimap-settings).

## Menu backgrounds and music

Taught in [chapter 15, section 3](15-interface-and-icons.md#3-backgrounds-skins-and-page-scripts). The job: [Icons and interface](p08-icons-and-interface.md).

The file `interface/pages/interface.set` sets the background picture, video and music of each menu screen.

### location
Where: `interface/pages/interface.set`, top-level block.    Type: block named by a quoted screen name.
Values: `"main"`, `"login"`, `"single"`, `"multi"`, `"multi_ingame"`, `"options"` or `"credits"`.
Does: Holds the background of that menu screen.
Limits: None known.
Example:
```
{location "single"
    {background
        {media "main" {file "/music/campaign_theme" loop}}
    }
}
```
See: [`background`](#background).

### background
Where: `interface/pages/interface.set`, inside `{location}`.    Type: block.
Values: holds `picture`, `video` and `media`.
Does: Groups the background settings of the screen.
Limits: None known.
Example:
```
{background
    {picture "/interface/pages/main/video_bkg"}
}
```
See: [`location`](#location).

### picture
Where: `interface/pages/interface.set`, inside `{background}`.    Type: text, a picture path without extension.
Values: a path under `/interface/`.
Does: Sets the still background picture.
Limits: A path with no file shows nothing and logs nothing.
Gates of Hell: a background can have a version per army; the army's file is used only when it exists, otherwise the plain one, so a mod need not ship one file per army.
Example:
```
{background
    {picture "/interface/pages/main/video_bkg"}
}
```
See: [`video`](#video).

### video
Where: `interface/pages/interface.set`, inside `{background}`.    Type: text, a video path without extension.
Values: a path under `/video/`.
Does: Plays a video behind the menu.
Limits: Only XviD-encoded `.avi` files are decoded. A video larger than 1280 by 720 may show only a still frame (unconfirmed).
Gates of Hell: the video can also be chosen per army, falling back to the plain file as for `picture`.
Example:
```
{background
    {video "/video/menu"}
}
```
See: [`picture`](#picture).

### media
Where: `interface/pages/interface.set`, inside `{background}`.    Type: block named by a quoted channel, holding `file`.
Values: a channel name such as `"main"`, then `{file "<path>" [loop]}` with a music path without extension.
Does: Plays music on the menu screen, repeating it with `loop`.
Limits: None known.
Example:
```
{media "main"
    {file "/music/main_theme" loop}
}
```
See: [`location`](#location).

## Skins

Taught in [chapter 15, section 3](15-interface-and-icons.md#3-backgrounds-skins-and-page-scripts). The job: [Icons and interface](p08-icons-and-interface.md).

Widget skins are set in `set/registry/default_skin.reg`, and the main menu has its own `main_menu_skin.reg` of the same shape.

### default_skin
Where: skin registry file, root block.    Type: block.
Values: one block per widget kind, such as `dialog`, `inputline`, `scrollbar`, `listbox` and `slider`.
Does: Sets the look of the game's widgets.
Limits: None known.
Gates of Hell: menu pages, message, confirm and input boxes, the game over and objectives windows and the message history are drawn with the `main_menu_dark_skin` skin instead of `main_menu_skin`, so a skin mod for menus needs that skin's data. Its world debug texts take their style from a skin entry `debug_console/text_style`.
Example:
```
{default_skin
    {dialog
        {frame_size 1}
    }
}
```
See: [`dialog`](#dialog).

### dialog
Where: skin registry file, inside `{default_skin}`.    Type: block.
Values: `frame_size` (whole number), `face_color` and `frame_color` (`"r g b"`), `text_style` (a text of formatting tags without the angle brackets).
Does: Sets the frame width, fill colour, frame colour and default text style of dialog windows.
Limits: None known.
Example:
```
{dialog
    {face_color "77 77 77"}
    {text_style "f(arial_hq)s(8)c(255 255 255)"}
}
```
See: [Text formatting tags](#text-formatting-tags).

### folder
Where: skin registry file, inside a widget block such as `{scrollbar}`.    Type: text, a folder path.
Values: a folder under `/interface/skin/`.
Does: Points the widget at the folder holding its pictures.
Limits: None known.
Example:
```
{scrollbar
    {folder "/interface/skin/editor/scrollbar/"}
}
```
See: none.

## Page scripts

Taught in [chapter 15, section 3](15-interface-and-icons.md#3-backgrounds-skins-and-page-scripts). The job: [Icons and interface](p08-icons-and-interface.md).

Page scripts are the `.ps` files in `interface/pages/script/`. The game loads all of them. A script adds handlers to menu pages; pages built into the game, such as the lobby and options, cannot be rebuilt from a script. Arguments passed to a handler are read as `#0`, `#1` and so on.

### script
Where: page script file, root block.    Type: block of page blocks.
Values: one `{"<page name>" ...}` block per page; the name `"page"` applies to every page.
Does: Holds the handlers and children each page gets.
Limits: Adding to an existing page by name is unconfirmed.
Gates of Hell: builds its screens, the battle screen included, from layout files under `interface/layout/` (XML); menu pages do not carry over between the games and must be rewritten. Whether it still reads page scripts is not confirmed. See [Gates of Hell only](#gates-of-hell-only).
Example:
```
{script
    {"page"
        {on key "KEY_ESC" {call "back"}}
    }
}
```
See: [`on`](#on).

### on
Where: page script file, inside a page block.    Type: block, an event then actions.
Values: `on create`, `on key "KEY_X"`, `on button "name"`, `on end "name"`, or `on "name"` for a handler that `call` can run.
Does: Runs the actions when the page is created, when a key is pressed, when a named button is clicked, when a named sequence ends, or when the handler is called by name.
Limits: In `on key`, a key name the game does not know stops the game with "Invalid key for bind"; unlike the key map, it is not skipped.
Example:
```
{"page"
    {on key "KEY_ESC"
        {call "back"}
    }
}
```
See: [`call`](#call).

### call
Where: page script file, inside an `on` handler.    Type: block, a quoted handler name then arguments.
Values: a handler name and any arguments.
Does: Runs the named handler, passing the arguments as `#0`, `#1` and onwards.
Limits: None known.
Example:
```
{on key "KEY_ESC"
    {call "back"}
}
```
See: [`on`](#on).

### align
Where: page script file, inside an `on` handler.    Type: block with a word.
Values: `begin`, `center` or `end`.
Does: Aligns the current element to the start, the centre or the end.
Limits: None known.
Example:
```
{on create
    {align center}
}
```
See: none.

## Icon folders and frames

Taught in [chapter 15, section 2](15-interface-and-icons.md#2-icons-and-how-they-are-named). The job: [Icons and interface](p08-icons-and-interface.md).

The interface never writes a file extension. A picture name such as `/interface/scene/unit_icon/pz4j` finds the files `pz4j_00.tga` to `pz4j_03.tga`. The game prefers `.ebm` and `.tex` files and otherwise takes `.dds`, `.tga`, `.bmp`, `.jpg` or `.png`. Names are not case-sensitive. Under `/interface/` and `/map/` a frame may be written `name_00` or `name00`.

The frame numbers mean:

| Frame | State |
|---|---|
| `_00` | normal |
| `_01` | mouse over it |
| `_02` | pressed |
| `_03` | disabled |
| `_04` | checked, for buttons that stay on |

Command panel buttons can have four variants of four frames each, so up to 16 frames. A missing picture never logs an error: the game shows a placeholder or nothing.

| Folder under `interface/scene/` | Holds | Picture name |
|---|---|---|
| `unit_icon/` | multiplayer purchase cards and category buttons | the card name, for squads with the side in brackets, such as `riflemans(usa)` |
| `unit_icon_small/` | the unit list in game | the vehicle's definition name |
| `squad/` | soldier portraits, side markers and group numbers | the breed's portrait name |
| `panel_control/` | command panel buttons | the action's `button` name |
| `structure/` | damage scheme per vehicle model | the model name |
| `portrait/` | soldier and crew portraits | the portrait name |

Category buttons of the purchase panel look for `unit_icon/<tag>(<army>)`, then `unit_icon/<tag>`, then the icon of the first card in that category, then the placeholder. Cursors are folders of animated frames under `interface/cursor/<name>/`.

## .lng text files

Taught in [chapter 14, section 2](14-localization.md#2-the-lng-syntax). The job: [Add or change text and translate it](p07-text-and-translation.md).

Text lives in `.lng` files. A mod's `localization/` folder is read as the game's `/interface/text/` folder. Vanilla texts are `desc.lng` (names), `info.lng` (tooltips), `#dlg_frontend.lng`, `#dlg_ingame.lng`, `#dlg_mp.lng`, `#tips.lng`, `mission.lng`, `campaign.lng` and mission files under `mission/single/`.

All `.lng` files are loaded, in sorted path order. A mod file at the same path as a vanilla file replaces the whole vanilla file; keys are not merged, so every vanilla key your copy leaves out shows as its raw key. When the same key appears twice, the later one wins and the log says "Localization key redefinition". A mod file whose name starts with `#` sorts before `desc.lng`, so a key it shares with `desc.lng` loses to the vanilla text. Text changes need a game restart; nothing has to be repacked. In the ARSENAL window, the Quick Guided Task "a mod with problems (fix them)" can remove the earlier copy of a repeated key for you ([Use the Quick Guided Task](p17-quick-guided-task.md)).

### tags
Where: `.lng` file, root block.    Type: block.
Values: nested key blocks and text blocks.
Does: Holds every text of the file.
Limits: A file whose root is not `{tags ...}` stops the game with "Identifier expected!". A file saved as UTF-16 or UTF-32 stops the game with "Please resave file in UTF8". A file saved in a Windows code page loads, but every non-ASCII letter shows as a replacement mark. A UTF-8 byte order mark is allowed.
Gates of Hell: still reads `.lng` files with the same root and key rules, but only under `localizations/<language code>/interface/text/`; a `.lng` left in this game's `localization/` folder is not loaded. Texts there come in two layers, the chosen language over the default one, and may also be gettext `.po`, `.pot` or `.mo` files. Whether a mod's own `.lng` folder is mounted there is not confirmed.
Example:
```
{tags
    {"entity"
        {"pz4j" "Pz.Kpfw. IV"}
    }
}
```
See: [chapter 14, section 2](14-localization.md#2-the-lng-syntax).

### key block
Where: `.lng` file, inside `{tags}` or another key block.    Type: block named by a quoted name.
Values: a name; names may contain spaces and brackets.
Does: Adds one level to the key path. The full key is the file name without extension, then each block name, joined by `/`. For a file whose name starts with `#`, the file name is left out; a file in a subfolder gets the folder path in front.
Limits: Keys are not case-sensitive, so `75mm_41M` and `75mm_41m` are the same key.
Gates of Hell: a key defined twice inside one file keeps its first text, not the last; across files the later file still wins and the log says "Localization key redefinition" with both places.
Example:
```
{"squad"
    {"riflemans(usa)" "Riflemen"}
}
```
See: [Text keys](#text-keys).

### text block
Where: `.lng` file, inside a key block.    Type: block of quoted strings.
Values: one or more strings. Escapes are `\"`, `\\`, `\n` for a new line and `\t` for a tab.
Does: Defines one text. Several strings in a row are joined.
Limits: A string must not run past the end of its line. A key the game asks for but nobody defines shows as the key itself, with no log message. Where the game fills numbers into a text, its `%` placeholders must stay in the same number and order as in vanilla, or values go missing or land in the wrong place.
Gates of Hell: a missing key still shows as the key itself, but the log says `Missing text: [key]` once per key.
Example:
```
{"zb30_mag mg_mauser" "7.92 mm\n Range - <c(ffaf00)>800 m<c(ffffff)>"}
```
See: [Text formatting tags](#text-formatting-tags).

## Text formatting tags

Taught in [chapter 14, "Colours and formatting tags"](14-localization.md#colours-and-formatting-tags). The job: [Add or change text and translate it](p07-text-and-translation.md).

Tags change how text is drawn. Several changes can share one tag, such as `<f(impact)s(28)c(255 255 255)>`. Write `<<`, or `&lt;`, for a literal `<`; `&gt;`, `&amp;` and `&quot;` also work. A tag without its closing `>` swallows the rest of the text.

### <c(...)>
Where: inside any text.    Type: tag with a colour.
Values: `c(RRGGBB)` in hexadecimal, `c(r g b)` in decimal, or `c*(k)` to brighten by a factor.
Does: Changes the text colour from that point.
Limits: Close each coloured run, or the colour carries on to the end of the text.
Example:
```
{"hint" "Range - <c(ffaf00)>200 m<c(ffffff)>"}
```
See: [`</c>`](#c-1).

### </c>
Where: inside any text.    Type: tag.
Values: none.
Does: Returns to the default text colour.
Limits: The spelling `<c/>` is unconfirmed; use `</c>` or an explicit colour.
Example:
```
{"hint" "<c(ff0000)>Warning</c> text"}
```
See: [`<c(...)>`](#c).

### <e(...)>
Where: inside any text.    Type: tag with an effect name.
Values: `shadow`, `shadow_ex`, `highlight`, `disabled`, `default`.
Does: Draws the text with that effect.
Limits: None known.
Gates of Hell: `shadow_ex` and `highlight` look swapped there: its `highlight` draws what `shadow_ex` draws here. Swap the two names when you move texts between the games.
Example:
```
{"title" "<e(shadow)>Briefing"}
```
See: none.

### <f(...)>
Where: inside any text.    Type: tag with a font family name.
Values: a font `name` from the font files.
Does: Changes the font family from that point.
Limits: A character the font lacks is drawn as `?`.
Example:
```
{"title" "<f(impact)s(28)>Victory"}
```
See: [Fonts](#fonts).

### <s(...)>
Where: inside any text.    Type: tag with a size.
Values: `s(28)` for a size, `s+2` or `s-2` to change the current size.
Does: Changes the font size from that point.
Limits: When the exact size is missing, the next smaller size is used.
Example:
```
{"title" "<s(18)>Objectives"}
```
See: [`size`](#size).

### <b>
Where: inside any text.    Type: tag.
Values: `<b>` on, `<b->` off.
Does: Switches bold text on or off.
Limits: Bold needs a bold font file of the same family and size.
Example:
```
{"label" "<b>Note:<b-> read this"}
```
See: [`<i>`](#i).

### <i>
Where: inside any text.    Type: tag.
Values: `<i>` on, `<i->` off.
Does: Switches italic text on or off.
Limits: None known.
Example:
```
{"quote" "<i>Hold the line<i->"}
```
See: [`<b>`](#b).

### <p(...)>
Where: inside any text.    Type: tag with a number.
Values: a spacing in pixels.
Does: Sets the spacing between letters.
Limits: None known.
Example:
```
{"title" "<p(2)>MISSION"}
```
See: none.

### <t(...)>
Where: inside any text.    Type: tag with a number.
Values: a tab width.
Does: Sets the width a `\t` tab moves the text.
Limits: None known.
Example:
```
{"row" "<t(80)>Range\t200 m"}
```
See: none.

## Text keys

Taught in [chapter 14, section 4](14-localization.md#4-key-families) and, for the keys the interface asks for, [chapter 15, section 8](15-interface-and-icons.md#8-texts-the-interface-asks-for). The job: [Add or change text and translate it](p07-text-and-translation.md).

The key families below are the ones the game looks up. In each entry, "Where" gives the vanilla file and block path the key normally lives in.

### desc/entity/<model>
Where: `desc.lng`, `{"entity" {"<model>" ...}}`.    Type: text.
Values: the model is the base name of the vehicle or gun definition file.
Does: Names the vehicle or gun in game and on its multiplayer card. A card whose name differs from the model also needs its own key here.
Limits: A missing key shows the raw key on screen and logs nothing.
Example:
```
{"entity"
    {"pz4j" "Pz.Kpfw. IV Ausf. J"}
}
```
See: [chapter 14, section 4](14-localization.md#4-key-families).

### desc/squad/<name>(<side>)
Where: `desc.lng`, `{"squad" {"<name>(<side>)" ...}}`.    Type: text.
Values: the card name and the side in brackets, as the card is written in the multiplayer unit files.
Does: Names a squad card and titles its info window. Cards that some vehicle macros build use the bare name without a side.
Limits: A wrong case or a missing side shows the raw key.
Gates of Hell: its unit cards and info windows take their texts from other keys (`mp/unit_info/...`, `entity_info/...`). Where it still asks for this key and finds none, a squad shows `???<name>` instead of the raw key (not confirmed which screens still ask).
Example:
```
{"squad"
    {"riflemans(usa)" "Riflemen"}
}
```
See: [`info/squad/<name>`](#infosquadname).

### desc/human/mp/<side>/<breed>
Where: `desc.lng`, `{"human" {"mp" {"<side>" {"<breed>" ...}}}}`.    Type: text.
Values: the breed file name; `_vision` and `_assist` variants are separate breeds and need their own keys.
Does: Names a soldier.
Limits: None known.
Example:
```
{"human" {"mp" {"usa"
    {"rifleman" "Private"}
}}}
```
See: none.

### desc/weapon/<tags>, desc/ammo/<tags>, desc/stuff/<tags>
Where: `desc.lng`, `{"weapon" ...}`, `{"ammo" ...}` or `{"stuff" ...}`.    Type: text.
Values: the item's tags in order, without `weapon`, `ammo`, `grenade` and `pattern`, joined by spaces. Items tagged `ammo` use `ammo`, items tagged `weapon` use `weapon`, all others use `stuff`.
Does: Names an item and gives its stat lines. An item's own `Desc` setting replaces the key. The weapon panel also labels the loaded ammunition with `desc/ammo/fg`, `desc/ammo/ap`, `desc/ammo/atgm` or `desc/ammo/heat`, by the first of these tags, in that order, that the ammunition has; with none of them, or nothing loaded, it uses `desc/ammo/`.
Limits: Tags in another order give a different key, which then shows raw.
Gates of Hell: the weapon panel picks the label from 37 ammunition kinds (such as `he`, `heat`, `apcr`, `apds`, `sm`) instead of these four.
Example:
```
{"ammo"
    {"zb30_mag mg_mauser" "7.92 mm belt"}
}
```
See: none.

### desc/weapon/type/<type>
Where: `desc.lng`, `{"weapon" {"type" ...}}`.    Type: text.
Values: a weapon class name.
Does: Labels the weapon class in the vehicle weapon panel.
Limits: None known.
Gates of Hell: the label is drawn in white text formatting the game adds itself.
Example:
```
{"weapon" {"type"
    {"mgun" "Machine gun"}
}}
```
See: none.

### info/entity/<name>
Where: `info.lng`, `{"entity" {"<name>" ...}}`.    Type: text.
Values: a model or card name; a card with `{info X}` uses `X` instead.
Does: Gives the long tooltip of the information button. For vehicles and guns the button also appears when the game can build technical info itself.
Limits: None known.
Example:
```
{"entity"
    {"pz4j" "Medium tank."}
}
```
See: [`info/squad/<name>`](#infosquadname).

### info/squad/<name>
Where: `info.lng`, `{"squad" {"<name>" ...}}`.    Type: text.
Values: a squad card name, with side.
Does: Gives the long tooltip of a squad card.
Limits: Without this key a squad card shows no information button.
Gates of Hell: does not read this key.
Example:
```
{"squad"
    {"riflemans(usa)" "Basic infantry squad."}
}
```
See: [`desc/squad/<name>(<side>)`](#descsquadnameside).

### info/special/<model>
Where: `info.lng`, `{"special" {"<model>" ...}}`.    Type: text.
Values: a model name.
Does: Gives the short class label, such as "field gun".
Limits: None known.
Example:
```
{"special"
    {"zis3" "Field gun"}
}
```
See: none.

### info/armor_angle/<model>/<volume>
Where: `info.lng`, `{"armor_angle" {"<model>" {"<volume>" ...}}}`.    Type: text.
Values: a model and one of its volumes.
Does: Gives the armour angle text in the technical view.
Limits: None known.
Gates of Hell: does not read this key.
Example:
```
{"armor_angle" {"pz4j"
    {"body_front" "20"}
}}
```
See: none.

### component/<key>
Where: `#dlg_ingame.lng`, `{"component" ...}`.    Type: text.
Values: a damage message name, such as `gun_broken` or `track_broken`.
Does: Gives the damage report text that interaction scripts and the damage report rules name.
Limits: A text that is not a key is printed as written; a misspelt key prints the raw key.
Example:
```
{"component"
    {"gun_broken" "<c(FFFF00)>Gun damaged<c(FFFFFF)>"}
}
```
See: [Reference 10, `damage_report`](r10-interaction-scripts.md#damage_report).

### mission/multi/<map folder>/name
Where: `mission.lng`, `{"multi" {"<map folder>" {"name" ...}}}`.    Type: text.
Values: the map folder path below `/map/`; a map in a subfolder needs every folder level.
Does: Names the map in the lobby. A `desc` key beside it gives its description.
Limits: A wrong path shows the raw key and logs nothing.
Example:
```
{"multi" {"mymap"
    {"name" "River Crossing"}
}}
```
See: none.

### mission/single/<campaign>/<mission>/...
Where: a mission file under `mission/single/<campaign>/`.    Type: text.
Values: keys the mission's own scripts name.
Does: Holds mission names, briefings, objectives and dialogue.
Limits: None known.
Example:
```
{"objectives"
    {"obj1" "Take the bridge"}
}
```
See: none.

### units/<name>/desc
Where: `set/registry/unit.reg`, `{units {"<name>" ...}}`, not a `.lng` file.    Type: text key.
Values: a text key.
Does: Names the text key a unit's name comes from; the game tries it before the `desc/` keys.
Limits: None known.
Example:
```
{units
    {"pz4j" {desc "desc/entity/pz4j"}}
}
```
See: [`desc/entity/<model>`](#descentitymodel).

### actionbar/<button>
Where: `#dlg_ingame.lng`, `{"actionbar" ...}`.    Type: text.
Values: the button picture name of an action. A block of the same name beside the text may hold the child keys `req`, `action` and `usage`.
Does: Gives the tooltip of a command panel button, with optional requirement, action and usage lines.
Limits: A missing key shows the raw key.
Gates of Hell: its new buttons need their own pictures and texts, such as `actionbar/browse_emplacement` with `req`, `action` and `usage`; a missing picture shows the `stub` picture.
Example:
```
{"repair" "Repair"}
{"repair"
    {"action" "Repair vehicle"}
}
```
See: [`button`](#button).

### actionbar/count_black
Where: `#dlg_ingame.lng`, `{"actionbar" ...}`.    Type: text.
Values: a text with the placeholder `%1%` for the number.
Does: Formats the item count badge on a button.
Limits: Keep its `%` placeholders as in vanilla.
Gates of Hell: uses `actionbar/count_white` for the badge and the button state label instead; define both keys when you move texts between the games.
Example:
```
{"actionbar"
    {"count_black" "<s(8)c(0 0 0)>%1%"}
}
```
See: [`ShowCount`](#showcount).

### actionbar/count_fx
Where: `#dlg_ingame.lng`, `{"actionbar" ...}`; also `count_fx_red`.    Type: text.
Values: a text.
Does: Formats the count badge drawn with an effect, and its red form.
Limits: Keep its `%` placeholders as in vanilla.
Example:
```
{"actionbar"
    {"count_fx_red" "<s(8)c(c8c8c8)e(shadow)>%1%"}
}
```
See: [`actionbar/count_black`](#actionbarcount_black).

### actionbar/key_hint
Where: `#dlg_ingame.lng`, `{"actionbar" ...}`.    Type: text.
Values: a text.
Does: Formats the hotkey line of a button tooltip.
Limits: Keep its `%` placeholders as in vanilla.
Example:
```
{"actionbar"
    {"key_hint" "%1% (<c(ffff60)>%2%</c>)"}
}
```
See: [Hotkeys](#hotkeys).

### mp/scene/hint_<button tag>
Where: `#dlg_mp.lng`, `{"scene" ...}`.    Type: text.
Values: a purchase category tag, such as `squad1` or `v3`.
Does: Gives the tooltip of a purchase category button.
Limits: None known.
Example:
```
{"scene"
    {"hint_squad1" "Infantry squads"}
}
```
See: [Icon folders and frames](#icon-folders-and-frames).

### mp/scene/hint_cost/<budget>, mp/scene/hint_cost2/<budget>
Where: `#dlg_mp.lng`, `{"scene" {"hint_cost" ...}}` and `{"hint_cost2" ...}`.    Type: text.
Values: a budget tag, such as `default`, `command` or `special`.
Does: Formats the cost shown on purchase cards; the card button uses `hint_cost2`.
Limits: Keep its `%` placeholders as in vanilla.
Example:
```
{"scene" {"hint_cost2"
    {"default" "%1% MP"}
}}
```
See: none.

### mp/scene/hint_level
Where: `#dlg_mp.lng`, `{"scene" ...}`.    Type: text.
Values: a text.
Does: Gives the rank hint shown when you hover over a locked card.
Limits: Keep its `%` placeholders as in vanilla.
Example:
```
{"scene"
    {"hint_level" "Level: %1%"}
}
```
See: none.

### mp/lobby/ping_s
Where: `#dlg_mp.lng`, `{"lobby" ...}`.    Type: text.
Values: a text.
Does: Formats the unlock countdown in seconds on a purchase card.
Limits: Keep its `%` placeholders as in vanilla.
Example:
```
{"lobby"
    {"ping_s" "%1%s"}
}
```
See: none.

### options/keys/<action id>
Where: `#dlg_frontend.lng`, `{"options" {"keys" ...}}`.    Type: text.
Values: an action id from the hotkey table.
Does: Titles the action in the controls options screen.
Limits: A missing key shows the raw id.
Gates of Hell: the ids differ (see [`"group/action"`](#groupaction)), so these keys follow the new group names.
Example:
```
{"options" {"keys" {"common"
    {"center_active" "Center on unit"}
}}}
```
See: [Hotkeys](#hotkeys).

### options/keys/keymap/<KEYNAME>
Where: `#dlg_frontend.lng`, `{"options" {"keys" {"keymap" ...}}}`.    Type: text.
Values: a key name such as `KEY_SPACE`; vanilla writes these keys in lower case, which is the same key.
Does: Gives the name of a key as the options screen shows it.
Limits: None known.
Example:
```
{"keymap"
    {"key_space" "SPACE"}
}
```
See: [Hotkeys](#hotkeys).

## Not described yet

These names are accepted by the game or appear in vanilla data, but no source describes what they do:

- Action file keys: `RequireSelect`, `NotifySelect`, `NotifyDoubleClick`, `AimEntities`, `AimCreatureOnly`, `AimRayTrace`, `AimStickToEnemy`, `DoubleClickAction`, `AbleDrag`, `able_vehicle`, `able_enqueue`, `entity`, `spacing`.
- Custom action instructions: `reserve_hands`, `unreserve_hands`, `take_item`, `free_hands`, `disable_action_restart`, `bind`, `place_on_bone`, `fsm_request`, `animation`, `animations`, `pour_animation`, `effect`, `effect_object`, `rail_check_free`, `check_jump_location`, `talk`, `pour_over`, `matchbox_fire`, `injection`, `undermine`, `plant`, `install`, `if`, `camera`, `quant_speed`, `sound`.
- Font key: `height`.
- HUD keys: selection `scale` with `normal` and `squad_member`; manual aiming blocks `piercing`, `zeroing`, `radius` and `hitmarker`, and their keys `background`, `bkg_invalid`, `bkg_satisfy`, `bkg_optimal`, `bkg_disabled`, `disabled`, `time`; minimap `frequencies` with `flag_capturing`, `flag_losing` and `selected_units`; minimap `view` and `props`.
- Skin keys beyond `frame_size`, `face_color`, `frame_color`, `text_style` and `folder`.
- Page script actions: `button`, `button_arrange`, `dialog`, `dialog_close`, `location`, `location_percent`, `navigation`, `page_back`, `picture`, `scroller`, `size`, `size_percent`, `text`; page event `destroy`; page script `dda`, `set` and `if`.
- Text tags: `<x...>` and `<y...>` alignment.
- Text key: `mp/scene/hint_time`.

## Gates of Hell only
<!-- goh: GHUI-03 GHUI-04 GHUI-05 GHUI-06 GHUI-07 GHUI-29 GHUI-36 GHUI-37 GHUI-38 GHUI-39 GHUI-40 GHUI-41 GHUI-42 GHUI-43 GHUI-44 GHUI-45 GHUI-73 GHUI-74 GHUI-75 GHUI-76 GHUI-77 GHUI-130 GHUI-157 GHUI-191 GHUI-192 GHUI-193 GHUI-194 GHUI-204 GHUI-205 GHUI-206 GHUI-208 GHUI-238 GHUI-251 GHUI-279 GHINT-04 GHINT-05 GHINT-06 GHINT-07 GHINT-09 GHINT-10 GHINT-11 GHINT-47 GHLOC-01 GHLOC-02 GHLOC-03 GHLOC-04 GHLOC-05 GHLOC-06 GHLOC-07 GHLOC-08 GHLOC-09 GHLOC-10 GHLOC-12 GHLOC-13 GHLOC-16 GHLOC-17 GHLOC-18 GHLOC-20 GHLOC-21 GHLOC-25 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

These keys, files and texts exist only in Gates of Hell; this game does not use them. Where it is known what this game does when it meets one, the entry says so. Most examples are taken from the Gates of Hell game files. How the chapters treat Gates of Hell: [chapter 15](15-interface-and-icons.md#gates-of-hell-summary) and [chapter 14](14-localization.md#gates-of-hell-summary); converting a unit from it: [Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md).

### Key
Where: action file, inside `{action}`.    Type: text, a key map id.
Values: an id from the key map, usually `"actions/<action name>"`.
Does: Gives the action the key bound under that id, with its key badge, so a custom action can have a hotkey.
Limits: The id must also be in the key map, or the action has no key.
Example:
```
{action
    {button "engine_toggle"}
    {Key "actions/engine_toggle"}
}
```
See: [`"group/action"`](#groupaction).

### FxEntity, AbleRotate, HideLdragArrow, IgnoreEntities
Where: action file, inside `{action}`.    Type: `FxEntity` takes a quoted object name and an optional scale; the others are flags.
Values: `FxEntity "name" [scale]`, scale 1 when left out; the flags are present or absent, all off by default.
Does: `FxEntity` shows an object, such as a selection circle, at the point and facing you give. `AbleRotate` lets a left-button drag set the facing. `HideLdragArrow` hides the drag arrow. `IgnoreEntities` makes the action ignore the objects under the cursor.
Limits: None known.
Example:
```
{action
    {fxEntity "selection_circle" 0.5}
}
```
See: [`fx`](#fx).

### delay
Where: action file of a custom action, inside `{action}`.    Type: number, seconds.
Values: a time in seconds.
Does: Offers the action only after the cursor has stayed on a good target for that long.
Limits: It probably reports the action usable once at the very start of the hold, so the cursor may flicker.
Example:
```
{action
    {target volume "climb" able touch}
    {delay 0.25}
}
```
See: [`target`](#target).

### fortify.set
Where: `interface/action/fortify.set`.    Type: file of `{Action "name" ...}` blocks.
Values: per block `Entity`, `Spacing`, `Cost`, `Rotation`, `AbleEnqueue`, `ScaleFromSize`, `TerrainRestrictions`, besides the usual action keys.
Does: Makes one fortification action per block, which lays a line of the named object. It replaces the built-in `barricade`, `barbwire` and `hedgehog`.
Limits: This game spells one key `able_enqueue`; each game skips the other's spelling. The squad needs `Cost` in stock for each copy.
Example:
```
{Action "%name"
    {Entity "%entity"}
    {Spacing %spacing}
    {Cost %cost}
    {AbleRotate}
}
```
See: [`action`](#action).

### airstrike, teleport, mine_ap, mine_at
Where: `interface/action/<name>.set`.    Type: action file.
Values: the file name is the action.
Does: Built-in actions: `airstrike` can be given by anyone, `teleport` moves a unit or the object under the cursor inside your own side's area, and `mine_ap` and `mine_at` lay mines like `mine` but need a selected unit and ignore objects.
Limits: None known.
Example:
```
{action
    {item "mine antipersonnel"}
    {item_in_box}
    {Key "actions/mine_ap"}
}
```
See: [`action`](#action).

### install_begin, install_end, action_reset, remove_from_inventory
Where: action file of a custom action, inside `{instructions}`.    Type: instructions.
Values: `install_begin` takes the object and turn like `install`; the others take nothing.
Does: `install_begin` places the object as an inactive half-built object and `install_end` finishes it; when the order stops between them, the half-built object is removed. `action_reset` cancels the unit's action as if by hand. `remove_from_inventory` takes one item with the action's item tags out of the inventory.
Limits: `remove_from_inventory` does nothing when the item is in the hand or the action has no item tags.
Example:
```
{Instructions
    {install_begin "%entity" %rotation}
    {animations "squat_repair_1 squat_repair_2" random loop totaltime %time paint 1}
    {install_end}
}
```
See: [`instructions`](#instructions).

### right_emplacement.set and new panel items
Where: `set/panel_control/right_emplacement.set`; item blocks in any panel layout.    Type: panel layout file and item types.
Values: item types `gc_cp_state_auto_medic`, `gc_cp_state_hatch`, `gc_cp_state_reverse`, `gc_cp_lock_ammo`, `gc_cp_state_altitude`, `gc_cp_state_manual_control_mode` and `gc_cp_browse_emplacement`.
Does: Adds the emplacement page and buttons for automatic medics, hatches, reverse gear, ammunition lock, helicopter height and the direct control mode. Their tooltips use the text groups `auto_medic/`, `hatch_state/`, `reverse_state/`, `ammo/`, `altitude/` and `manualMode/`.
Limits: Each needs its picture under `interface/scene/panel_control/` (`auto_medic`, `vehicle/hatch`, `vehicle/reverse`, `lock_ammo`, `helicopter/altitude`, `control_type`, `cp_emplacement`), or it shows the `stub` picture.
Example:
```
{panel_control
    {gc_cp_state_auto_medic
        {position 0 0}
        {condition "medic"}
    }
}
```
See: [`<item name>`](#item-name).

### helicopter, hatch, engine, -<tag>
Where: panel layout file, inside `{condition}`.    Type: quoted word.
Values: the words themselves, or `-` followed by one of the tag terms.
Does: `helicopter`, `hatch` and `engine` show the button only if a selected unit has that tag; `-<tag>` hides it when a selected unit has the tag.
Limits: Not available in this game, where an unknown term stops the game.
Example:
```
{gc_cp_state_hatch
    {position 2 2}
    {condition "hatch"}
}
```
See: [`condition`](#condition).

### New key ids
Where: key map file, child block of `{keys}`.    Type: block named by a quoted action id.
Values: `control_manual/` `manual_mode_toggle`, `weapon_reload`, `toggle_crouch`, `toggle_prone`, `order_squad`, `helicopter_up`, `helicopter_down`, `visionmode`, `special_action`, `sprint`, `vault`, `squadmember1` to `squadmember10`; `actions/` `cycle_pose`, `lock_ammo`, `toggle_auto_medic`, `vehicle_toggle_reverse`; and the groups `interface/`, `control_camera/` and `groups/` that replace most of `common/`.
Does: Binds the new direct control, pose, squad member, helicopter and panel functions. `actions/toggle_auto_medic` switches automatic healing of the selected medics.
Limits: Without a binding the feature has no key.
Example:
```
{"control_manual/manual_mode_toggle"
    {value KEY_T}
    {single}
}
```
See: [`"group/action"`](#groupaction).

### category
Where: key map file, inside an action id block.    Type: quoted name and quoted value.
Values: a category name, such as `"manual_helicopter"`.
Does: Puts the key in a category; when you rebind, a clash with another key is only reported inside the same category, and a key with no category clashes with any.
Limits: None known.
Example:
```
{"control_manual/helicopter_up"
    {value KEY_Q}
    {single}
    {"category" "manual_helicopter"}
}
```
See: [`noedit`](#noedit).

### human_view, squad_view, vehicle_view, crew_view
Where: `set/interface.set`, inside `{interface}`.    Type: blocks.
Values: `show`, `offset x y`, for `squad_view` and `crew_view` also `spacing`; `vehicle_view` also has `colors` with `working` and `broken`, each a text of `percent:R G B A` pairs separated by commas.
Does: Places the soldier, squad, crew and vehicle panels of the battle screen. The vehicle colours run from the first pair to the last by percent of health, blended per channel; a destroyed vehicle is drawn black.
Limits: The block `crew_view` lost its colour keys.
Example:
```
{vehicle_view
    {show}
    {offset 150 -150}
    {colors
        {broken "0:215 0 0 180,100:215 0 0 180"}
    }
}
```
See: [`structure colors`](#structure-colors).

### manual_targeting
Where: `set/interface.set`, inside `{interface}`.    Type: block.
Values: as [`manual_targetting`](#manual_targetting) here, plus `accuracy_circle` (`show`, `speed`), `zoom_factor` (`show`, the zoom shown by the crosshair) and `ammo` with `grenade` (`show`, `offset`, the fuse of a cooked grenade).
Does: Sets the read-outs while you aim by hand.
Limits: The spelling with two `t`s is not read there.
Example:
```
{manual_targeting
    {accuracy_circle
        {show}
        {speed 500}
    }
}
```
See: [`manual_targetting`](#manual_targetting).

### Layout files
Where: `interface/layout/*.xml`.    Type: XML layout files.
Values: elements with attributes; `enableif="<condition>"` with property names and `!`, `(`, `)`, `&`, `|`, `and`, `or`; `${name}` for a property and `#{key}` for a text key; `<Properties>` to set your own.
Does: Builds every screen, the battle screen included. An element whose `enableif` is false is not made at all, nor anything inside it. Built-in properties include `game.multiplayer`, `game.singleplayer`, `game.cooperative`, `game.replay`, `window.size.x` and `window.size.y`; every value of `interface/layout/gui.xml` is a property too.
Limits: An unknown property logs "No property ... found" and a malformed condition logs "Couldn't parse expression"; both leave the element out, so a typo hides it. An unknown `${name}` logs "Unable to expand property" and gives an empty text. This game cannot read these files; screens must be rebuilt, not converted.
Example:
```
<DialogRef refid="gui_chatview" shared="true" enableif="!session.debug"/>
```
See: [`script`](#script).

### M(...)
Where: inside any text; Gates of Hell data uses it only in the `textFormat` of a layout text.    Type: tag with a mode.
Values: `upper` or `u`, `lower` or `l`, `none` or `off`; a `/M` tag returns to normal.
Does: Writes the following text in capitals or small letters.
Limits: An unknown mode logs "unexpected transform mode" and shows the tag as text. This game shows `<M(UPPER)>` as written.
Example:
```
<Text key="mp/lobby2/button/advanced" textFormat="m(upper)"/>
```
See: [`<e(...)>`](#e).

### localization.info and language folders
Where: `localizations/<code>/localization.info`; texts in `localizations/<code>/interface/text/`.    Type: SDL file with a `language` block.
Values: `code`, `name`, `steamLanguageCode`, `defaultChatChannel` and an optional `order`.
Does: Every folder with this file is a language the game offers, sorted by `order`. The language is chosen from the configuration, then the Steam language, then the player's language option (`{game {language ...}}` in the profile's `options.set`), the later one winning; an unknown code falls back to `default`.
Limits: With no language found the game stops with "No available localizations found! Verify game resources".
Example:
```
{language
    {code "default"}
    {name "English"}
    {steamLanguageCode "english"}
    {defaultChatChannel 0}
}
```
See: [`tags`](#tags).

### .po, .pot and .mo files
Where: a language's `interface/text/` folder.    Type: gettext text files.
Values: one entry per key: `msgctxt` is the key, `msgid` the original text, `msgstr` the translation.
Does: Supplies texts. The default language reads `.pot` and `.lng`; other languages read `.mo`, `.po` and `.lng` over the default ones. An empty `msgstr` shows the `msgid`.
Limits: An entry without `msgctxt`, or marked `fuzzy`, gives no text, so the raw key shows. The languages `default` and `en` never read `.po` or `.mo`. Plural entries do not work: write one `msgctxt`, `msgid` and `msgstr` per key.
Example:
```
msgctxt "button/discordserver"
msgid "JOIN DISCORD SERVER!"
msgstr ""
```
See: [`text block`](#text-block).

### dev_l10n_reload, dev_l10n_export_pot
Where: the game console.    Type: console commands.
Values: `dev_l10n_export_pot` takes an optional folder, by default `/interface/text/`.
Does: `dev_l10n_reload` reloads the texts of the chosen language without a restart. `dev_l10n_export_pot` writes every `.lng` file below the folder as a `.pot` file under `localizations/exported/`, for translators.
Limits: Passing `""` as the folder probably crashes the game.
Example:
```
dev_l10n_reload
```
See: [`.lng` text files](#lng-text-files).

### New and renamed text keys
Where: the text files.    Type: text keys.
Values: `actionbar/count_white` (the button count badge and state label), `mp/scene/pause` (was `hints/pause`), `mp/scene/hint_time2`, `mp/scene/hint_available` and `mp/scene/hint_requires/<condition>` (buy tooltips; `hint_time` is gone), `gamebar/clock_style` (the style of the game bar clocks), `mp/chat2/color_mention`, `mp/chat2/color_welcome_msg`, `mp/chat2/color_supporter`, `mp/chat2/color_supporter_self`, and `actionbar/browse_emplacement`.
Does: Gives the texts and colours of the newer screens.
Limits: Texts moved from this game keep the old names and show raw keys there.
Example:
```
msgctxt "actionbar/count_white"
msgid "<f(anka)s(14)c(220 220 220)p(0)x(3)y(3)e(shadow)>%1%"
msgstr ""
```
See: [Text keys](#text-keys).
