# nativepass: make a ported unit native by data rows
`node tools/nativepass/nativepass.js <mod dir> --out <dir> [--rules <file|dir>] [--dry] [--json f] [--game G]`
Reads `<mod>/resource/entity/-vehicle/**/<stem>/<stem>.def`, applies rows (default `rules/*.json`, file name then id order), writes every text file of the mod to `<out>`; never into `<mod>`. Record nativepass/1. Tests: `sh tools/nativepass/test/run.sh [name]` (engine cases, then `test/rules/<name>.json` against `rules/<name>.json`).
Edits are splices on the source text: CRLF, comments, cp1251 bytes kept. A key from a mod include/define edits that file; a `%param` value edits the macro call's `param(..)`; a vanilla include is skipped. First rule on a key wins, later ones are skipped. Class as tools/native decides; no class: untouched, listed.

Row form (`{"form":"nativerules/1","rules":[..]}`):
`{"id":"<file>-NN","key":"<flat key, * one level, ** any depth>","class":["tank_medium"] | "*","act":"drop|move|set|scale|clamp|keep","to":..,"value":..,"factor":..,"when":"absent|present","why":"<12 words>","src":"<proof>","tag":"V|I|T"}`
Rows without id, src, a known act or the act's field are refused (record `bad`). `value` may be `{"<class>":v,"*":v}`.
Strings in `value` are written as SDL text: `"\"tank\""` writes a quoted string. Integers stay integers under scale/clamp.

One example per act:
```json
{"id":"x-01","key":"entity/fueltank","class":"*","act":"drop","why":"no as64 reader","src":"no as64 reader: q -g fueltank","tag":"V"}
{"id":"x-02","key":"entity/cooldown","class":"*","act":"move","to":"entity/extender:smokescreen/cooldown","why":"as64 reads it under the extender","src":"","tag":"I"}
{"id":"x-03","key":"entity/extender:smokescreen/cooldown","class":["tank_medium","tank_heavy"],"act":"set","when":"absent","value":{"tank_heavy":8,"*":5},"why":"peers carry it","src":"vanilla 30 of 30 tank_medium","tag":"V"}
{"id":"x-04","key":"entity/volume/thickness/*","class":"*","act":"scale","factor":0.8,"why":"GoH armour scale to as64","src":"tools/xlate/table.json armor_body_front","tag":"I"}
{"id":"x-05","key":"entity/bone/limits","class":["cannon"],"act":"clamp","value":[-10,25],"why":"vanilla range","src":"vanilla 12 of 12 cannon","tag":"I"}
{"id":"x-06","key":"entity/weaponry/place/gunner","class":"*","act":"keep","why":"read by as64, peers differ by chance","src":"","tag":"I"}
```
(src values above are placeholders showing the form, not real proofs.)
Record per unit: `applied:[{rule,key,act,from,to,n?}]` (from/to = first occurrence, n = occurrences when more than one), `skipped:[{rule,key,why}]`.
`--game` (default the G install when present): resolves vanilla includes and lets tools/native pick the class; without it the path segment gives the class.
Rule test case: `test/rules/<name>.json` = `[{"name","class","def","expect"}]`, def placed as a `-vehicle/<class>` unit, rules from `rules/<name>.json` only, no game.
