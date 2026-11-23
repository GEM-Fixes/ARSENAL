#!/bin/sh
# seeded two-mod fixture of loose files: one paired def, one identical def, one map dir per side
# Author: Imperator_Aug (ARSENAL, ia-9cc725fd)
d=$(dirname "$0"); f="$d/.fx"; rm -rf "$f"
mkdir -p "$f/a/resource/entity/-vehicle/ger/tank_medium/t1" "$f/b/resource/entity/-vehicle/tank_medium/t1" \
  "$f/a/resource/entity/-vehicle/ger/car/c1" "$f/b/resource/entity/-vehicle/car/c1" \
  "$f/a/resource/map/multi/m1" "$f/b/resource/map/multi/m2"
printf '{game_entity\r\n {perks {component "x" {health 10}}}\r\n {mass 30}\r\n}\r\n' > "$f/a/resource/entity/-vehicle/ger/tank_medium/t1/t1.def"
printf '{game_entity\r\n {armor {setting "x" {thickness 5}}}\r\n {mass 10}\r\n}\r\n' > "$f/b/resource/entity/-vehicle/tank_medium/t1/t1.def"
printf '{game_entity\r\n {mass 2}\r\n}\r\n' | tee "$f/a/resource/entity/-vehicle/ger/car/c1/c1.def" > "$f/b/resource/entity/-vehicle/car/c1/c1.def"
printf '{mission\r\n {squads}\r\n}\r\n' > "$f/a/resource/map/multi/m1/m1.mi"
printf '{mission\r\n {tasks}\r\n}\r\n' > "$f/b/resource/map/multi/m2/m2.mi"
# expand pass: the A def pulls its chassis block from an include that only the base game dir holds; B has it inline
mkdir -p "$f/abase/resource/properties"
printf '{chassis {speed 3}}\r\n' > "$f/abase/resource/properties/ch.inc"
printf '{game_entity\r\n (include "/properties/ch.inc")\r\n {perks {component "x" {health 10}}}\r\n {mass 30}\r\n}\r\n' > "$f/a/resource/entity/-vehicle/ger/tank_medium/t1/t1.def"
printf '{game_entity\r\n {chassis {speed 2}}\r\n {armor {setting "x" {thickness 5}}}\r\n {mass 10}\r\n}\r\n' > "$f/b/resource/entity/-vehicle/tank_medium/t1/t1.def"
node "$d/../pairdiff.js" --a "$f/a" --b "$f/b" --out "$f/o2.json" --no-goh-fix --base-a "$f/abase" --base-b "$f/b" >/dev/null || { echo FAIL: run2; rm -rf "$f"; exit 1; }
node "$d/../pairdiff.js" --a "$f/a" --b "$f/b" --out "$f/o.json" --no-goh-fix >/dev/null || { echo FAIL: run; rm -rf "$f"; exit 1; }
ex=$(node -e "
const c=p=>{const g=JSON.parse(require('fs').readFileSync(p)).groups['entity/-vehicle/tank_medium'];return g.onlyB.filter(e=>/chassis/.test(e[0])).length+'/'+g.onlyA.filter(e=>/chassis/.test(e[0])).length};
console.log('chassis='+c(process.argv[1])+','+c(process.argv[2]))" "$f/o.json" "$f/o2.json")
got=$(node -e "
const r=JSON.parse(require('fs').readFileSync(process.argv[1]));const g=r.groups||{};
const ks=Object.keys(g).sort();const o=[];
for(const k of ks){const x=g[k];o.push(k+':'+x.pairs+'/'+x.identical+' a='+x.onlyA.map(e=>e[0]).filter(s=>/health/.test(s)).length+' b='+x.onlyB.map(e=>e[0]).filter(s=>/thickness/.test(s)).length)}
console.log(o.join(' ')+' maps='+r.maps.profileA.maps+','+r.maps.profileB.maps+','+r.maps.pairs)" "$f/o.json")
rm -rf "$f"
got="$got $ex"
want='entity/-vehicle/car:1/1 a=0 b=0 entity/-vehicle/tank_medium:1/0 a=1 b=1 maps=1,1,0 chassis=2/0,0/0'
if [ "$got" = "$want" ]; then echo PASS; else echo "got: $got"; echo "want: $want"; echo FAIL; fi
