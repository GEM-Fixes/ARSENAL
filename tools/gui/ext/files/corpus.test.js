// files/corpus.js + lib.search through it (run: node corpus.test.js; also from files/test.js)
// corpus + search through it: same hits as the plain walk, changed file re-read, regex prefilter keeps the hits
const fs=require('fs'),path=require('path'),os=require('os');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'corp-'));
process.env.ARSENAL_TEST_STORE=path.join(dir,'store');
// Author: Imperator_Aug (ARSENAL, ia-4d02a8a1)
'use strict';
const lib=require('./lib.js'),corpus=require('./corpus.js'),mt=require('./../../../lib/modtree');
const mod=path.join(dir,'mod');const w=(r,t)=>{const f=path.join(mod,r);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,t)};
w('mod.info','{mod\r\n\t{name "t"}\r\n}\r\n');w('resource/set/a.set','{armor 12}\r\n{name "Tiger"}\r\n');w('resource/set/b/c.set','tiger two\r\n');w('resource/set/b.txt','x tiger\r\n');
w('resource/entity/x.def',Buffer.concat([Buffer.from('{name "'),Buffer.from([0xcf,0xf0,0xe8]),Buffer.from(' tiger"}\r\narmor 7\r\n')]));
w('resource/bin.dat',Buffer.concat([Buffer.from([0,1,2]),Buffer.from('tiger')]));w('.git/x.txt','tiger');w('resource/t.dds','tiger');
let n=0,bad=0;const ok=(c,m)=>{n++;if(!c){bad++;console.log('FAIL '+m)}};
const strip=r=>JSON.stringify(r.hits.map(h=>[h.rel,h.line,h.col,h.text]));
(async()=>{
  const ctxA={gamedir:'',tmpRoot:dir},ctxB=Object.assign({modtree:mt},ctxA);
  const a=await lib.search(ctxA,{mod,q:'tiger'}),b=await lib.search(ctxB,{mod,q:'tiger'});
  ok(a.hits.length===4&&strip(a)===strip(b),'same hits, same order: '+strip(a)+' / '+strip(b));
  ok(corpus._cur()&&corpus._cur().total===6,'corpus holds the candidates '+(corpus._cur()&&corpus._cur().total));
  const ra=await lib.search(ctxA,{mod,q:'armor +[0-9]+',regex:true}),rb=await lib.search(ctxB,{mod,q:'armor +[0-9]+',regex:true});
  ok(ra.hits.length===2&&strip(ra)===strip(rb),'regex: same hits '+strip(ra)+' / '+strip(rb));
  const ka=await lib.search(ctxA,{mod,q:'При'}),kb=await lib.search(ctxB,{mod,q:'При'});
  ok(ka.hits.length===1&&strip(ka)===strip(kb),'cp1251 text: same hit, the ASCII files are passed over '+strip(kb));
  const rc=await lib.search(ctxB,{mod,q:'^tiger',regex:true});ok(rc.hits.length===1&&rc.hits[0].rel==='resource/set/b/c.set','regex ^ on a line start');
  w('resource/set/a.set','{armor 12}\r\n{name "Panther"}\r\n');mt.touch(mod);
  const c=await lib.search(ctxB,{mod,q:'tiger'});ok(c.hits.length===3&&!c.asOf,'a touched mod is walked again and the changed file read again');
  const wm=await lib.searchWarm(ctxB,{mod,wait:1});ok(wm.state==='ready'||wm.state==='loading','warm '+JSON.stringify(wm));
  ok((await lib.searchWarm(ctxA,{mod})).state==='na','warm without the shared walk: na');
  corpus.drop();fs.rmSync(dir,{recursive:true,force:true});
  console.log(bad?'corpus: FAIL '+bad:'corpus: PASS '+n);process.exit(bad?1:0);
})().catch(e=>{console.log('corpus: FAIL '+e.stack);process.exit(1)});
