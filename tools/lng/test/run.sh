#!/bin/sh
# Author: Imperator_Aug (ARSENAL, ia-e315573d)
cd "$(dirname "$0")"
W=$(mktemp -d) && W=$(cd "$W" && { pwd -W 2>/dev/null || pwd; }) || exit 1; trap 'rm -rf "$W"' EXIT; export TEST_WORK="$W"   # per-run work dir: fixture and outputs never touch tracked files
node mkfixture.js || exit 1
L=../lng.js; F=$W/fixture
node $L extract $F/mod --out $F/a.tsv -q > $F/ex.txt
grep -o ': [A-Z_]*' $F/ex.txt | sed 's/^: //' | sort | uniq -c | sed 's/^ *//' > $W/got.txt
# round trip, no edits: every file identical, except a LF .lng comes back CRLF (game text data)
node $L merge $F/mod $F/a.tsv --out $F/rt --all > $F/rt.txt
node -e "
const fs=require('fs'),p=require('path');
const cmp=(a,b)=>{ if(!fs.readFileSync(a).equals(fs.readFileSync(b))){console.log('FAIL: round trip differs '+a);process.exit(1);} };
for(const f of ['localization/desc.lng','localizations/default/interface/text/desc/desc_x.pot']) cmp('$F/mod/'+f,'$F/rt/'+f);
const a=fs.readFileSync('$F/mod/localization/#my.lng','latin1'),b=fs.readFileSync('$F/rt/localization/#my.lng','latin1');
if(!/[^\r]\n/.test(a)||a.split('\n').join('\r\n')!==b){console.log('FAIL: LF .lng not CRLF-normalized on merge');process.exit(1);}
if(!fs.existsSync('$F/rt/resource/interface/text/packed.lng')){console.log('FAIL: packed not written loose');process.exit(1);}
const zr=require('../../lib/pak'),pl=zr.list('$F/mod/localizations/ru.pak'),pe=pl.find(e=>e.name==='ru/interface/text/desc/y.po');
if(!pe||!fs.existsSync('$F/rt/localizations/ru/interface/text/desc/y.po')||!fs.readFileSync('$F/rt/localizations/ru/interface/text/desc/y.po').equals(zr.read(pl,pe))){console.log('FAIL: .po in lang pak not read or round trip differs');process.exit(1);}
if(fs.existsSync('$F/rt/localization/bad.lng')){console.log('FAIL: bad.lng written');process.exit(1);}
" || exit 1
# edits
node -e "
const fs=require('fs');const t=fs.readFileSync('$F/a.tsv','utf8').split('\n');
const o=t.map(l=>{const c=l.split('\t');
 if(c[1]==='desc/entity/foo')c[3]='Renard <c(ff0000)>rouge</c> %s';
 if(c[1]==='desc/entity/bar')c[3]='Zwei\\\\nZeilen \"x\"';
 if(c[1]==='desc/info/squad/s1'){c[2]='old source';c[3]='Trupp';}
 if(c[1]==='hello'&&c[2]==='dup')c[3]='doppelt';
 if(c[1]==='packed/p/q')c[3]='Gepackt';
 if(c[1]==='desc/squad/sq(ger)')c[3]='Trupp %s';
 if(c[1]==='desc/squad/long')c[3]='AB neu';
 if(c[1]==='desc/weapon/w1')c[3]='Vintovka 2';
 if(c[1]==='desc/entity/stale'){}
 return c.join('\t')});
o.push(['localization/desc.lng','desc/entity/nokey','x','y','' ].join('\t'));
o.push(['localization/nofile.lng','k','x','y',''].join('\t'));
fs.writeFileSync('$F/b.tsv',o.join('\n'));"
node $L merge $F/mod $F/b.tsv --out $F/o -q > $F/mg.txt
grep -o ': [A-Z_]*' $F/mg.txt | sed 's/^: //' | sort | uniq -c | sed 's/^ *//' >> $W/got.txt
grep -v '^#' truth.md > $W/want.txt
diff $W/want.txt $W/got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
chk() { grep -qF -- "$2" "$1" || { echo "FAIL: $1 lacks $2"; exit 1; }; }
chk $F/o/localization/desc.lng 'Renard <c(ff0000)>rouge</c> %s'
chk $F/o/localization/desc.lng 'Zwei\nZeilen \"x\"'
chk $F/o/localization/desc.lng '; comment'
chk $F/o/localization/desc.lng 'Squad {0} x'
chk $F/o/localization/#my.lng 'doppelt'
chk $F/o/localization/#my.lng 'Привет'
chk $F/o/resource/interface/text/packed.lng 'Gepackt'
chk $F/o/localizations/default/interface/text/desc/desc_x.pot 'msgstr "Trupp %s"'
chk $F/o/localizations/default/interface/text/desc/desc_x.pot 'msgstr "AB neu"'
chk $F/o/localizations/ru/interface/text/desc/y.po 'msgstr "Vintovka 2"'
# every merged .lng is CRLF, also #my.lng whose source is LF
for f in localization/desc.lng localization/#my.lng resource/interface/text/packed.lng; do
  node -e "const b=require('fs').readFileSync(process.argv[1],'latin1');process.exit(/(^|[^\r])\n/.test(b)?1:0)" "$F/o/$f" || { echo "FAIL: LF in merged $f"; exit 1; }
done
# FIX-PORT (tools-mod:30): a new --out folder gets the source mod.info, CRLF; dry run writes none; a source without one warns
node -e "const b=require('fs').readFileSync(process.argv[1],'latin1');process.exit(b==='{name \"lng fixture\"}\r\n{desc \"x\"}\r\n'?0:1)" "$F/o/mod.info" || { echo "FAIL: merge --out mod.info missing or not CRLF"; exit 1; }
grep -q LNG_MODINFO_COPIED $F/rt.txt || { echo "FAIL: LNG_MODINFO_COPIED not reported"; exit 1; }
cp -r $F/mod $F/mod2 && rm $F/mod2/mod.info && node $L merge $F/mod2 $F/b.tsv --out $F/o2 2>&1 | grep -q WARN_LNG_NO_MODINFO || { echo "FAIL: no source mod.info not warned"; exit 1; }
# source untouched, out==source refused
node $L merge $F/mod $F/b.tsv --out $F/mod/sub 2>&1 | grep -q LNG_OUT_IS_SOURCE || { echo "FAIL: out in source"; exit 1; }
# --dry-run writes nothing
node $L merge $F/mod $F/b.tsv --out $F/dry --dry-run > /dev/null; [ -e $F/dry ] && { echo "FAIL: dry wrote"; exit 1; }
# GOLD: a merged value changes that value only. desc.lng (CRLF source): exactly the foo and bar lines differ, every other byte equal
node -e "
const fs=require('fs');const a=fs.readFileSync('$F/mod/localization/desc.lng','latin1').split('\r\n'),b=fs.readFileSync('$F/o/localization/desc.lng','latin1').split('\r\n');
if(a.length!==b.length){console.log('FAIL: GOLD line count');process.exit(1);}
const d=a.map((l,i)=>l===b[i]?null:i).filter(i=>i!==null);
if(d.length!==2||!/\"foo\"/.test(b[d[0]])||!/\"bar\"/.test(b[d[1]])||a[d[0]].replace(/\"Fox[^}]*\"/,'')!==b[d[0]].replace(/\"Renard[^}]*\"/,'')){console.log('FAIL: GOLD merge changed more than the edited values: '+d);process.exit(1);}
// BOM kept, LF-source #my.lng: only the hello/dup value differs (compare after EOL normalisation)
const m=fs.readFileSync('$F/mod/localization/#my.lng','latin1').replace(/\r\n/g,'\n').split('\n'),n=fs.readFileSync('$F/o/localization/#my.lng','latin1').replace(/\r\n/g,'\n').split('\n');
const e=m.map((l,i)=>l===n[i]?null:i).filter(i=>i!==null);
if(m.length!==n.length||e.length!==1||!/dup/.test(m[e[0]])||!/doppelt/.test(n[e[0]])||m[0].slice(0,3)!==n[0].slice(0,3)){console.log('FAIL: GOLD #my.lng');process.exit(1);}
" || exit 1
# (include "p") in a .lng (LOC-21): extract names the part, merge writes back into it
i=$(node inc.test.js); echo "$i"; [ "$i" = "inc ok" ] || exit 1
echo PASS
