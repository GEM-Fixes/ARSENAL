#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-236fa3d0)
cd "$(dirname "$0")"
node mkfixture.js || { echo FAIL; exit 1; }
S=../shotcrop.js; F=fixture; mkdir -p work
fail() { echo "FAIL: $1"; echo FAIL; exit 1; }
[ "$(node $S $F/t.jpg --info)" = "32x16" ] || fail info
node $S $F/t.jpg --box 8,4,16,8 --scale 3 --out work/c.png >/dev/null || fail crop
node $S $F/t.jpg --frac 0,0,0.5,0.5 --scale 2 --smooth --out work/f.png >/dev/null || fail frac
node -e "
const s=require('../shotcrop.js');
const a=s.decodePng(require('fs').readFileSync('work/c.png'));
if(a.width!==48||a.height!==24){console.log('dims',a.width,a.height);process.exit(1);}
const px=(i,x,y)=>[...i.data.subarray((y*i.width+x)*3,(y*i.width+x)*3+3)];
const near=(p,q)=>p.every((v,k)=>Math.abs(v-q[k])<=6);
// box x 8..24: left 8px red (scaled 24), right 8px blue
if(!near(px(a,5,5),[200,40,40])){console.log('red',px(a,5,5));process.exit(1);}
if(!near(px(a,40,20),[30,60,220])){console.log('blue',px(a,40,20));process.exit(1);}
const b=s.decodePng(require('fs').readFileSync('work/f.png'));
if(b.width!==32||b.height!==16||!near(px(b,3,3),[200,40,40])){console.log('frac',b.width,b.height);process.exit(1);}
" || fail pixels
node $S $F/t.jpg --box 20,0,16,8 --out work/x.png 2>/dev/null; [ $? -eq 2 ] || fail "oob exit"
[ ! -f work/x.png ] || fail "oob wrote file"
node $S $F/prog.jpg --info 2>work/err.txt; [ $? -eq 2 ] || fail "prog exit"
grep -q progressive work/err.txt || fail "prog msg"
# real shot (optional)
R=../../../../run/shots/full/080941-i1.jpg
if [ -f $R ]; then
  W=$(node $S $R --info); [ -n "$W" ] || fail real
  node $S $R --frac 0.3,0,0.4,0.08 --scale 2 --out work/real.png >/dev/null || fail real
fi
echo PASS
