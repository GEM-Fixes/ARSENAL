; scope fixture for kit.test.js: every "; @name" marks a line; the test asks scopeAt for the state at the start of it
(define "my_helper" ; @def_head
	{on "helper_ev" overload ; @def_on
		{call "x"} ; @def_body
	}
)
{"kit_a tank" ; @a_head
	{on spawn ; @a_on
		{play_sound "x;y {not a brace" 1} ; @a_in_spawn
		{if rand 0.5 ; @a_if
			{set "f1" 1} ; @a_branch
		else not "f1"
			{set "f1" 0} ; @a_else
		else
			{delay 2 ; @a_delay
				{view start "x"} ; @a_timer
			}
		}
	}
	{on bullet_hit {view start "y"}} ; @a_one_line
	{on pierce overload ; @a_pierce
		{delay_ex 1 ; @a_delayex
			{if volume "body" ; @a_dx_if
				{view start "z"} ; @a_dx_branch
			}
		}
		{spawn "fx" ; @a_spawn
			{view start "q"} ; @a_container
		}
		{health_damage_pierce ; @a_hdp
			{effects "a" "b"} ; @a_value
		}
		{delay 1 ; @a_delay2
			{if volume "body" ; @a_d_if
			}
		}
	}
	("my_helper") ; @a_call
} ; @a_close
; @top_after
{entities ; @ents
	(include "x.inc") ; @ents_in
}
{effects ; @eff
	{"sand" ; @sand
		{on hit ; @sand_hit
			{spawn "a"} ; @sand_in
		}
	}
}
{entity ; @data
	{extension "x" ; @data_ext
		{mass 100} ; @data_nested
	}
}
{"kit_b"
	(mod "mp" ; @mod_head
		{on spawn ; @mod_in
		}
	)
	{on ik begin "turret" ; @ik
		{view start "w"} ; @ik_in
	}
}
