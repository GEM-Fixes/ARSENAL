# seeded: one line per measured fact (lines of gamediff output, sorted compare)
top-folder only as2: map/ 2
top-folder only goh: difficulties/ 1
ext only as2: mi 1, (none) 1
ext only goh: materials 1, txt 1
root only as2: def:actor 1
root only goh: 
include target only as2: stuff_small.ext 1
include target only goh: stuff_weapon.ext 1
kind def blocks as2 6 goh 6 | only as2 (2): gears 2, actor 1 | only goh (1): caststeel 2
kind map.mi blocks as2 2 goh 0 | only as2 (2): mission 1, zonea 1 | only goh (0): 
kind weapon blocks as2 2 goh 2 | only as2 (1): rechargetime 1 | only goh (1): calibre 1
bin .ply as2 1 [EPLY v1 1] goh 1 [BPLY v2 1]
mapdirs as2 1 ext-presence {mi 1, (none) 1}
mapdirs goh 0 ext-presence {}
lng as2 files 1 lng 1 pot 0 msgctxt 0 bom 1 utf8 1 cp1251 0 ascii 0 names #dlg.lng 1
lng goh files 1 lng 0 pot 1 msgctxt 2 bom 0 utf8 0 cp1251 0 ascii 1 names a.pot 1
modinfo as2 mods 1 digitfolders 0 other 1 subdirs {resource 1} keys {name 1, mingameversion 1} minGameVersion {3.262 1} maxGameVersion {} tags {}
modinfo goh mods 1 digitfolders 0 other 1 subdirs {resource 1} keys {name 1, tags 1, mingameversion 1} minGameVersion {1.500 1} maxGameVersion {} tags {mod 1}
