// uilint tables, copied from the game (regen by hand on engine edits):
//   KEY_NAMES s_keyNames (StringToKey; uppercase lookup)
//   ACTIONS REGISTER_ACTION names ( et al): compiled actions
//   ITEM_TYPES REGISTER_ITEM_TYPE names (game/control/*Panel*.cpp) + gc_cp_command_use/cancel
//   INSTRUCTIONS REGISTER_INSTRUCTION names (game/interface/instruction*.cpp)
//   KEY_ACTIONS ids ReadKeys turns into key; CODE_KEY_IDS ids code reads
// Author: Imperator_Aug (ARSENAL, ia-4c66a48c)
const words = s => s.trim().split(/\s+/);

const KEY_NAMES = new Set(words(`KEY_ESCAPE KEY_1 KEY_2 KEY_3 KEY_4 KEY_5 KEY_6 KEY_7 KEY_8 KEY_9 KEY_0 KEY_MINUS KEY_EQUALS KEY_BACK KEY_TAB
KEY_Q KEY_W KEY_E KEY_R KEY_T KEY_Y KEY_U KEY_I KEY_O KEY_P KEY_LBRACKET KEY_RBRACKET KEY_RETURN KEY_LCONTROL KEY_A KEY_S KEY_D KEY_F KEY_G
KEY_H KEY_J KEY_K KEY_L KEY_SEMICOLON KEY_APOSTROPHE KEY_GRAVE KEY_LSHIFT KEY_BACKSLASH KEY_Z KEY_X KEY_C KEY_V KEY_B KEY_N KEY_M KEY_COMMA
KEY_PERIOD KEY_SLASH KEY_RSHIFT KEY_MULTIPLY KEY_LALT KEY_SPACE KEY_CAPSLOCK KEY_F1 KEY_F2 KEY_F3 KEY_F4 KEY_F5 KEY_F6 KEY_F7 KEY_F8 KEY_F9
KEY_F10 KEY_NUMLOCK KEY_SCROLL KEY_NUMPAD7 KEY_NUMPAD8 KEY_NUMPAD9 KEY_SUBTRACT KEY_NUMPAD4 KEY_NUMPAD5 KEY_NUMPAD6 KEY_ADD KEY_NUMPAD1
KEY_NUMPAD2 KEY_NUMPAD3 KEY_NUMPAD0 KEY_DECIMAL KEY_F11 KEY_F12 KEY_F13 KEY_F14 KEY_F15 KEY_KANA KEY_CONVERT KEY_NOCONVERT KEY_KANJI KEY_STOP
KEY_AX KEY_RCONTROL KEY_DIVIDE KEY_SYSRQ KEY_RALT KEY_PAUSE KEY_HOME KEY_UP KEY_PRIOR KEY_LEFT KEY_RIGHT KEY_END KEY_DOWN KEY_NEXT KEY_INSERT
KEY_DELETE KEY_LWIN KEY_RWIN KEY_APPS KEY_ESC KEY_ENTER KEY_BACKSPACE KEY_NUMPADSTAR KEY_NUMPADMINUS KEY_NUMPADPLUS KEY_NUMPADPERIOD
KEY_NUMPADSLASH KEY_UPARROW KEY_PGUP KEY_LEFTARROW KEY_RIGHTARROW KEY_DOWNARROW KEY_PGDN KEY_ANY MOUSE0 MOUSE1 MOUSE2 MOUSE3 MOUSE4 MOUSE5
MOUSE6 MOUSE7 MOUSE_LEFT MOUSE_RIGHT MOUSE_MIDLE KEY_CONTROL KEY_ALT KEY_SHIFT ALT CTRL SHIFT DOUBLE ~ALT ~CTRL ~SHIFT ~DOUBLE`));

const ACTIONS = new Set(words(`none select disable move rotate cover accelerate cancel drop pour_in pour_out fortification board emit enter
repair collect examine care injection attach detach reinforce throw_ap_grenade throw_at_grenade throw_sk_grenade aimed_shot bazooka_shot
suppression_fire advance attack attack_ground attack_melee heal medic call_ally mine barricade barbwire hedgehog`));

const ITEM_TYPES = new Set(words(`gc_cp_command_use gc_cp_command_cancel gc_cp_state_manual_control gc_cp_state_inventory gc_cp_state_objectives
gc_cp_state_message_history gc_cp_state_map gc_cp_state_map_control gc_cp_state_map_zoom_in gc_cp_state_map_zoom_out gc_cp_leave_unit
gc_cp_state_smoke_decoy gc_cp_game_menu gc_cp_state_highlight_stuff gc_cp_state_highlight_corpses gc_cp_state_highlight_silhouettes
gc_cp_state_pose gc_cp_state_fire gc_cp_state_move gc_cp_state_speed gc_cp_state_cannon gc_cp_squad_control gc_cp_state_weapon
gc_cp_state_reload gc_cp_state_attach gc_cp_state_supply gc_cp_browse_attack gc_cp_browse_useitem gc_cp_browse_special gc_cp_browse_back
gc_cp_dummy`));

const INSTRUCTIONS = new Set(words(`reserve_hands unreserve_hands take_item free_hands disable_action_restart bind place_on_bone fsm_request
animation animations pour_animation effect effect_object rail_check_free check_jump_location talk pour_over matchbox_fire injection undermine
plant install if camera quant_speed sound`));

const KEY_ACTIONS = new Set(words(`cancel emit examine drop attack attack_ground attack_melee rotate repair attach throw_ap_grenade
throw_at_grenade throw_sk_grenade bazooka_shot heal use`));
const CODE_KEY_IDS = new Set([].concat(
  words('center_active prev_unit next_unit toggle_attack toggle_position slowdown stuff_highlight corpses_highlight toggle_objectives toggle_message_history toggle_equipment dismiss_squad toggle_map toggle_map_control show_selection_circle game_menu pause screenshot videocapture set_commander').map(x => 'common/' + x),
  words('toggle quick_aim modify forward backward left right fire next_weapon fire_mode next_ammo next_mgun').map(x => 'control_manual/' + x),
  words('mouse_rotate zoom_in zoom_out rotate_left rotate_right increase_view decrease_view').map(x => 'control_camera/' + x),
  words('stay_lie pose_up pose_down drop_from_hands').map(x => 'control_human/' + x),
  words('chat_team chat_all show_statistics leave_unit push_to_talk toggle_microphone show_notification').map(x => 'multiplayer/' + x),
  words('smoke_decoy').map(x => 'actions/' + x),
  [...KEY_ACTIONS].map(x => 'actions/' + x)));

const COND_TERMS = new Set(words('vehicle tank cannon tractor human single multiple commander disabled'));

// ---- GoH tables (picked by uilint when the game is goh). Rows from gohweb, untested [V], none run in game.
//   GOH_ACTIONS  compiled actions: AS2 list + airstrike teleport mine_ap mine_at (GHGPL-36, ui/goh-action-set-keys); AS2 hard-coded
//                barricade barbwire hedgehog gone ( as64): every {Action "name"} block of interface/action/fortify.set
//                is one fortification instead (uilint reads those names from the data)
//   GOH_ITEM_TYPES AS2 list + 7 item types new in GoH (ui/goh-action-bar-panel-control, GoH )
//   GOH_INSTRUCTIONS AS2 list + action_reset remove_from_inventory install_begin install_end (GHUI-275, GHINT-09, GHINT-10)
//   GOH_COND_TAGS  code-panel unit tags (GHUI-75); `-<tag>` hides the item. GOH_COND_TERMS = tags + single multiple commander disabled.
//                  Layout bars also match any unit tag or soldier ability name and hide an unknown term silently (GHUI-76)
const GOH_ACTIONS = new Set([...ACTIONS].filter(a => !['barricade', 'barbwire', 'hedgehog'].includes(a)).concat(words('airstrike teleport mine_ap mine_at')));
const GOH_ITEM_TYPES = new Set([...ITEM_TYPES].concat(words(`gc_cp_state_auto_medic gc_cp_state_hatch gc_cp_state_reverse gc_cp_lock_ammo
gc_cp_state_altitude gc_cp_state_manual_control_mode gc_cp_browse_emplacement`)));
const GOH_INSTRUCTIONS = new Set([...INSTRUCTIONS].concat(words('action_reset remove_from_inventory install_begin install_end')));
const GOH_COND_TAGS = new Set(words('vehicle tank cannon tractor human helicopter hatch engine'));
const GOH_COND_TERMS = new Set([...GOH_COND_TAGS].concat(words('single multiple commander disabled')));
const GOH = { ACTIONS: GOH_ACTIONS, ITEM_TYPES: GOH_ITEM_TYPES, INSTRUCTIONS: GOH_INSTRUCTIONS, COND_TAGS: GOH_COND_TAGS, COND_TERMS: GOH_COND_TERMS };

module.exports = { KEY_NAMES, ACTIONS, ITEM_TYPES, INSTRUCTIONS, KEY_ACTIONS, CODE_KEY_IDS, COND_TERMS, GOH };
