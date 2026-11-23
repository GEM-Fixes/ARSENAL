{selector
 {type "only_tanks"}
 {group {select {class tank}} {sort distance}}
 {group {select {class car}}}
}
{selector
 {type "ranged"}
 {group {select {in_range 50}}}
}
{selector
 {type "late_all"}
 {group {select {class tank}}}
 {group {sort distance}}
}
{selector
 {type "no_groups"}
}
