{"prop_crate"
	{on spawn
		{if not "opened"
			{set "closed"}
		}
	}
	{on bullet_hit
		{if stuff "bullet"
			{spawn "wood_chips_small"}
		else stuff "shell"
			{hide 1}
		}
	}
	{on blast
		{explode_inventory
			{0.5 "ex_crate_small" 3}
			{0.9 "ex_crate_big" 5}
		}
		{kill_delay "crate_burn"}
	}
	{on ik begin "lid"
		{if "closed" {set "opened"} }
	}
	{on ik end "lid"
		{if not "closed" {set "opened"} }
	}
}
