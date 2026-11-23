# spmis seeded defects: one per line, code the tool must give and its exit
| defect | code | exit |
|---|---|---|
| missing_text_key | SPMIS_TEXT_KEY | 1 |
| objective_no_trigger | SPMIS_OBJ_NO_TRIGGER | 1 |
| unit_def_missing | SPMIS_DEF | 1 |
| no_lose | SPMIS_NO_LOSE | 1 |
| win_unreachable | SPMIS_WIN_UNREACHABLE | 1 |
| undefined_zone | SPMIS_REF | 1 |
| out_inside_install | SPMIS_IN_INSTALL | 1 |
| spec_def_unknown | SPMIS_DEF | 1 |
| spec_point_unknown | SPMIS_POINT | 1 |
| spec_escort_vehicle | SPMIS_UNCONFIRMED | 1 |
| spec_no_lose | SPMIS_NO_LOSE | 1 |
| goh_refused | SPMIS_GOH | 2 |
| exists_no_force | SPMIS_EXISTS | 1 |
| remove_not_generated | SPMIS_NOT_GENERATED | 1 |

Seeded in test.js section 9 on their own fixture maps (fx_edge: pather box -1500..1500; fx_blind: no pather box):
- a unit moved past the pather box of the map's [auto] clip in 0.mi: SPMIS_OUTSIDE, exit 1
- a waypoint and a generated goal zone moved past it: SPMIS_OUTSIDE each, exit 1
- generate with named places outside the box: info SPMIS_MOVED and SPMIS_UNIT_MOVED, every position inside, exit 0
- a map with no pather box (generate and check): info SPMIS_AREA_UNKNOWN, exit 0
