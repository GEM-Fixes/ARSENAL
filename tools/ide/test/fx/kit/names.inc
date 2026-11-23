(define "pos_helper"
	{on "%0"
		{view start "%1"}
	}
)
(define "named_helper"
	{on fire "%place"
		{play_sound "%snd" 1}
	}
	("pos_helper" args "a" "b")
)
{"kit_names tank ru"
	{on spawn
		{set "flag_a" 1}
		{tags add "smoking"}
		{view start "view_a"}
		{add_view "fx" "view_b" "bone"}
		{play_sound "snd_a" 1}
		{link_sound "move" "vehicle/x"}
		{ani_play "anim_a"}
		{call "called_a"}
		{delay_effect 3 1 "called_b"}
		{if "flag_b"
		else not "flag_c"
		}
	}
	{on "custom_a"
	}
	{on animation_end "anim_b"
	}
	("named_helper" place(gun) snd(boom))
	(include "inc_a.inc")
}
