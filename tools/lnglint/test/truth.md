# seeded defects (ground truth) in bad/localization
1 desc.lng:3-4  duplicate key differing only in case (Riflemans/riflemans) LOC-03/04
2 desc.lng:5    unclosed format tag <c(ff0000)MG  LOC-07
3 desc.lng:6    stray literal '<' (needs << or &lt;) LOC-08
4 desc.lng:7    Cyrillic look-alike 'а' in Latin word "Tank"
5 desc.lng:8-9  string spans lines LOC-06
6 desc.lng:end  unbalanced braces ({"squad" opened, file not closed)
7 info.lng      UTF-16 BOM -> rejected LOC-05
8 #dlg_mp.lng   cp1251 bytes, invalid UTF-8 (not cp1251!) LOC-05

# --game compare: vc/mod vs vc/game (fixture vanilla, loose)
9  vc/mod desc.lng  drops vanilla key b (WARN_LNG_FILE_SHADOWS_VANILLA, 1 of 5)
10 vc/mod desc.lng  key c drops %d, key e drops {1} -> 2x WARN_LNG_PARAM_MISMATCH (reordered same set is not flagged)
info: a,c,e override (3, LNG_OVERRIDES_VANILLA); n new (LNG_KEY_NEW); '#dlg' x override (info)
