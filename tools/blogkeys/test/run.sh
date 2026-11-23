#!/bin/sh
# seeded posts + census: hit counts per word must equal truth
# Author: Imperator_Aug (ARSENAL, ia-a5865cce)
d=$(dirname "$0")
cat > "$d/.news.json" <<'EOF'
{"appnews":{"newsitems":[
{"title":"a","date":1600000000,"feedname":"steam_community_announcements","contents":"[*] Added recoil to all rifles. The hp_broken value now matters. Unrelated sentence goes here."},
{"title":"b","date":1600000001,"feedname":"steam_community_announcements","contents":"More recoil tuning for the [b]new[/b] rifles. A hp broken vehicle stays. subrecoilx must not match here."}
]}}
EOF
cat > "$d/.census.json" <<'EOF'
{"diff":{"def":{"gohOnly":[{"key":"a > recoil","n":5},{"key":"a > hp_broken","n":4},{"key":"a > absent_key","n":3},{"key":"a > xy","n":9},{"key":"a > rare_key","n":1}]}}}
EOF
node "$d/../blogkeys.js" --census "$d/.census.json" --news "$d/.news.json" --out "$d/.hits.json" >/dev/null || { echo FAIL: run; exit 1; }
got=$(node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1]));console.log(r.map(x=>x.key+'='+x.posts+'/'+x.hits.length).sort().join(' '))" "$d/.hits.json")
want='absent_key=0/0 hp_broken=2/2 recoil=2/2'
rm -f "$d/.news.json" "$d/.census.json" "$d/.hits.json"
if [ "$got" = "$want" ]; then echo PASS; else echo "got: $got"; echo "want: $want"; echo FAIL; fi
