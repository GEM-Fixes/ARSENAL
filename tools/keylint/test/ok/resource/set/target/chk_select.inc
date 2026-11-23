{selector
 {type "late_all"}
 {group {select {class tank}} {sort distance}}
 {group {sort distance}}
}
{selector
 {type "ranged"}
 {group {select {in_range 50}}}
}
{selector
 {type "ignore_only"}
 {group {ignore attacking}}
}
