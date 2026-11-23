#!/bin/sh
# testmap: generated files read back through the map parsers, sizes and spawn points checked. no game launched
# Author: Imperator_Aug (ARSENAL, ia-91ac8d08)
cd "$(dirname "$0")/../../.." || exit 1
t=$(mktemp -d); ok=1
node tools/testmap/testmap.js --out "$t/m" > "$t/o" || { echo "write failed: $(cat "$t/o")"; ok=0; }
node -e "
const fs=require('fs'),d=process.argv[1]+'/m/resource/map/multi/pv_tiny/',net=require('./tools/lib/mapnet.js').parse(fs.readFileSync(d+'map.net'));
const bad=m=>{console.log(m);process.exitCode=1};
if(net.problems.length)bad('net problems '+JSON.stringify(net.problems));
if(net.width!==500||net.height!==500||net.cell!==10)bad('net size '+net.width+'x'+net.height);
if(net.cells.length!==500*500*4)bad('net cells '+net.cells.length);
const p=fs.readFileSync(d+'map.ply');if(p.toString('latin1',0,4)!=='BPLY')bad('magic');
const v=p.indexOf('VERT',0,'latin1'),n=p.readInt32LE(v+4),i=v+12+n*p.readInt32LE(v+8);
if(p.toString('latin1',i,i+4)!=='IND4')bad('no IND4 after vertices');
const c=p.readInt32LE(i+4);if(i+8+c*4!==p.length)bad('index count');
for(let k=0;k<c;k++)if(p.readUInt32LE(i+8+k*4)>=n)bad('index past vertices');
const s=p.indexOf('SUBM',0,'latin1');if(p.readInt32LE(s+22)*3!==c)bad('face count');
const mi=fs.readFileSync(d+'combat.mi','latin1');for(const w of ['a1','a2','b1','b2'])if(!mi.includes('{name '+w+'}'))bad('no point '+w);
const mt=fs.readFileSync(d+'mtl0.mtl','latin1');if((mt.match(/\{layer /g)||[]).length!==2)bad('material needs exactly 2 layers');
if(!mi.includes('{triggers'))bad('no triggers');if(!/\r\n/.test(mi))bad('not CRLF');
" "$t" || ok=0
# seeded: a gap that puts a spawn outside the playable area must refuse
node tools/testmap/testmap.js --out "$t/x" --gap 300 > "$t/o" 2>&1 && { echo "gap outside map accepted"; ok=0; }
node tools/testmap/testmap.js --out "$t/x" --size 50 > "$t/o" 2>&1 && { echo "size 50 accepted"; ok=0; }
# games: mowas_2 and as64 write the same bytes as no --exe; goh refused with one plain line, nothing written; unknown exit 2
for e in as64 mowas_2; do
  node tools/testmap/testmap.js --out "$t/$e" --exe $e > "$t/o" 2>&1 || { echo "--exe $e failed"; ok=0; }
  ( cd "$t/m" && find . -type f | sort | xargs cat ) > "$t/a"; ( cd "$t/$e" && find . -type f | sort | xargs cat ) > "$t/b"
  cmp -s "$t/a" "$t/b" || { echo "--exe $e differs from no --exe"; ok=0; }
done
node tools/testmap/testmap.js --out "$t/g" --exe goh > "$t/o" 2>&1; r=$?
[ $r = 2 ] && grep -q '^testmap: not available for GoH: .*(plan/reports/game-parity/t-run-b.md)$' "$t/o" && [ ! -e "$t/g" ] || { echo "goh not refused right ($r): $(cat "$t/o")"; ok=0; }
node tools/testmap/testmap.js --out "$t/u" --exe nosuch > "$t/o" 2>&1; [ $? = 2 ] || { echo "unknown --exe not exit 2"; ok=0; }
rm -rf "$t"
[ $ok = 1 ] && echo PASS || { echo FAIL; exit 1; }
