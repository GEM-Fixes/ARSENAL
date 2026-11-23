{"prop_barrel"
	{on "stop"	{view stop ""}}
	{on "pause"	{view pause ""}}
	{on "delete"{delete}}
}

{"prop_ghost"
	{on "delete"{hide 3}}
}

(define "burn_slowly"
	{on spawn
		{delay 2
			{set "burning"}
		}
	}
	{on contact
		{if effector "human"
			{delay 0
				{constrain_velocity 1}
			}
		}
	}
)

{"prop_torch" ("burn_slowly")}
{"prop_lamp" ("burn_slowly")}

{"prop_chunk"
	{on spawn
;		{con "spawn chunk"}
		{delay 0.1
			{volumes disable bullet contact blast touch}	;prevent destroying at spawn moment
		}
		{delay 2 {volumes enable bullet contact blast}}
		{call "stop_view"}
		{delay 25 15 {hide 10}}
	}
	{on "stop_view"
		{view stop ""}
	}
	{on blast_hit
		{if min_energy 0.5
			{hide 1}
		else
			{impulse up 3 1 dir 2 1}
		}
	}
	{on bullet_hit
		{if stuff "bullet"
			{impulse up 2 1 dir 1 0.5}
		else stuff "shell"
			{hide 1}
		}
	}
}
