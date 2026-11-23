#!/bin/sh
# determ self-test: a script that prints a date fails (clock), one that lists a folder unsorted fails (order),
# local time of a fixed instant fails (tz), a cwd-relative temp path fails (path); the sorted / UTC / absolute twins pass.
# Author: Imperator_Aug (ARSENAL, ia-33f9b55f)
d=$(cd "$(dirname "$0")" && pwd)
w=$(mktemp -d) && w=$(cd "$w" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$w"' EXIT
node "$d/../determ.js" --commands "$d/commands.json" --work "$w" --json "$w/r.json" > "$w/out.txt" 2>&1; rc=$?
cat "$w/out.txt"
[ $rc = 1 ] || { echo "FAIL: exit $rc, want 1 (some differ)"; exit 1; }
node -e "
const j=require(process.argv[1]);const want={date:'clock',list:'order',tz:'tz',where:'path','list-sorted':'','tz-utc':'','where-abs':''};
if(j.form!=='determ/1')throw 'form';
const ids=j.commands.map(c=>c.id);if(ids.join()!==ids.slice().sort().join())throw 'not sorted';
for(const [id,c] of Object.entries(want)){const r=j.commands.find(x=>x.id===id);if(!r)throw 'missing '+id;
 if(r.same!==(c===''))throw id+': same='+r.same+' '+r.first;if(r.cause!==c)throw id+': cause '+r.cause+' want '+c;if(!r.same&&!r.first)throw id+': no first line';}
if(j.counts.all!==7||j.counts.same!==3)throw 'counts '+JSON.stringify(j.counts);
if(/\d{4}-\d\d-\d\d/.test(JSON.stringify(j).replace(/\"first\":\"[^\"]*\"/g,'')))throw 'date outside first';
" "$w/r.json" || { echo "FAIL: determ/1 result"; cat "$w/r.json"; exit 1; }
node "$d/../determ.js" --only nosuch --commands "$d/commands.json" --work "$w" > /dev/null 2>&1; [ $? = 2 ] || { echo "FAIL: unknown --only id not exit 2"; exit 1; }
echo PASS
