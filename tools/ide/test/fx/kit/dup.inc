(define "file_helper"
	{on "file_ev"
	}
)
{"kit_dup1 tank" ; @dup1
	{on spawn ; @dup1_spawn
	}
	{on ik begin "turret"
	}
	{on "named_ev" overload ; @dup1_named
	}
	(mod "mp"
		{on contact ; @dup1_mod_contact
		}
	)
} ; @dup1_end
{"kit_dup2 tank"
	("file_helper") ; @dup2_call
} ; @dup2_end
{"pz1 tank"
	("pz1_sound") ; @pz_call
} ; @pz_end
{"kit_unknown tank"
	{on spawn
	}
	("not_known_helper") ; @unk_call
} ; @unk_end
{"kit_inc tank"
	(include "more.inc") ; @inc_line
} ; @inc_end
{"kit_door"
	("door" args 1) ; @door_call
} ; @door_end
{"kit_door0"
	("door") ; @door0_call
} ; @door0_end
{"kit_tfx"
	("terrain_fx" args "sand" sand) ; @tfx_call
} ; @tfx_end
{"kit_door_lines"
	("door" ; @ml_call
		args 3)
} ; @ml_end
{"kit_door_two"
	("door" args 5) ("door") ; @two_call
} ; @two_end
(define "kit_bp"
	{on "burn_%0_start"
	}
)
{"kit_bp"
	("kit_bp" args 1) ; @bp_call
	("kit_bp" args 2) ; @bp_call2
} ; @bp_end
