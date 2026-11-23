# preloadsweep test truth (case number = block in cases.js)
1 plan: mod.info + preload, UTF-8 CRLF, range copied, Require target, base list kept, only 3 entries in the folder
1b --all-defs = target layers only (loose + pak); unknown name warned; --out in target, install or a foreign folder refused
2 all markers, one Can't preload, bad caught -> COMPLETE, bravo FAILED, others NO_ERROR, no pass wording
2b real def as bad sentinel crashes -> CRASHED, sentinel CAUGHT, calibrated on a real def
3 real def as bad sentinel silent -> NOT_CALIBRATED, says every NO_ERROR is meaningless
3b bad sentinel behind a crash -> NOT_CALIBRATED, not reached
4 no marker -> INCONCLUSIVE, no NO_ERROR row. another run's markers -> same. crash before any marker -> same
5 crash mid list -> entity after the last marker FAILED, before NO_ERROR, after NOT_REACHED. cut log -> INCOMPLETE. --crashed. crash past tail not attributed
6 other exe name in log, other sha on disk, markers out of order -> INCONCLUSIVE. second load: last pass judged
7 bisect 10-list with one crasher -> that one, within printed run budget. all-crash tree. A clean -> B inferred
8 bisect --log: crash and clean read from log, stale log refused, real-def sentinel left out of the lists
