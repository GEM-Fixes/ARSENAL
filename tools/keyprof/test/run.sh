#!/bin/sh
# regression: keyprof on a copy of fixture/keys.set (vanilla profile head). seeded defects must be caught, edits byte-exact, restore exact
# Author: Imperator_Aug (ARSENAL, ia-51a0419e)
d=$(cd "$(dirname "$0")" && pwd); K="$d/../keyprof.js"; w=$(mktemp -d); f="$w/keys.set"; cp "$d/fixture/keys.set" "$f"; ok=1
chk() { if [ "$2" = "$3" ]; then :; else echo "FAIL $1: got [$2] want [$3]"; ok=0; fi; }
# 1 bad token (lim UI-11) -> exit 1, file untouched
node "$K" --file "$f" --set common/slowdown=KEY_FOO >"$w/o1"; chk badkey-exit $? 1
chk badkey-code "$(grep -c '^KEY_BAD common/slowdown' "$w/o1")" 1
chk badkey-file "$(cmp -s "$f" "$d/fixture/keys.set" && echo same)" same
# 2 modifiers only -> error
node "$K" --file "$f" --set "common/slowdown=shift+ctrl" >/dev/null; chk modonly-exit $? 1
# 3 dry run writes nothing
node "$K" --file "$f" --set common/toggle_map=KEY_Y >/dev/null; chk dry-file "$(cmp -s "$f" "$d/fixture/keys.set" && echo same)" same
# 4 write: one line changes, CRLF kept, backup taken
node "$K" --file "$f" --set common/toggle_map=key_y --write >/dev/null; chk write-exit $? 0
chk write-diff "$(diff "$d/fixture/keys.set" "$f" | grep -c '^[<>]')" 2
chk write-line "$(grep -c '{value KEY_Y}' "$f")" 1
chk write-crlf "$(tr -cd '\r' < "$f" | wc -c | tr -d ' ')" "$(tr -cd '\n' < "$f" | wc -c | tr -d ' ')"
chk write-bak "$(cmp -s "$f.keyprof" "$d/fixture/keys.set" && echo same)" same
# 5 noedit / dup / new action warnings
node "$K" --file "$f" --set common/pause=KEY_O --set "z/new=shift + key_u" >"$w/o5"
chk warn-noedit "$(grep -c '^WARN_NOEDIT common/pause' "$w/o5")" 1
chk warn-dup "$(grep -c '^WARN_DUP common/pause' "$w/o5")" 1
chk warn-new "$(grep -c '^WARN_NEW_ACTION z/new' "$w/o5")" 1
# 6 list sees the edit
chk list "$(node "$K" --file "$f" --list common/toggle_map | head -1)" "$(printf 'common/toggle_map\tKEY_Y')"
# 7 restore byte-exact, backup removed
node "$K" --file "$f" --restore >/dev/null; chk restore "$(cmp -s "$f" "$d/fixture/keys.set" && echo same)" same
chk restore-bak "$([ -f "$f.keyprof" ] && echo left || echo gone)" gone
# 8 instance 0 refused
node "$K" --inst 0 --list >/dev/null 2>&1; chk inst0 $? 2
# 9 game parity: --exe mowas2/goh (TST-19, GHVFS-13 refusals; GoH keys.set rules GHUI-36, GHUI-251)
node "$d/goh.js" >"$w/o9" || { cat "$w/o9"; ok=0; }
rm -rf "$w"
[ $ok = 1 ] && echo PASS || echo FAIL
