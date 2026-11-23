#!/bin/sh
# exam/draw: seeded draw on a synthetic unitgroups file: same seed same draw, other seed differs, every group once, edrun list shape
# Author: Imperator_Aug (ARSENAL, ia-2b1a4029)
cd "$(dirname "$0")/../../.." || exit 1
T="${TMPDIR:-/tmp}/exam-test-$$"; rm -rf "$T"; mkdir -p "$T"
node -e "
const fs=require('fs'),A=require('assert'),d=require('./tools/exam/draw.js'),T=process.argv[1];
// 12 groups, pools 1..12, kinds mixed, one infantry group
const groups={cards:0,groups:Array.from({length:12},(_,i)=>({sig:'s'+i,kind:i===3?'infantry':i===4?'gun':'vehicle',rep:'u'+i+'_0',members:Array.from({length:i+1},(_,k)=>({card:'u'+i+'_'+k,armies:[]}))}))};
fs.writeFileSync(T+'/g.json',JSON.stringify(groups));
const G=d.normGroups(groups);
A.strictEqual(G.length,12); A.strictEqual(G[0].g,'g01:u0_0','id g<NN>:<rep>');
const key=r=>r.pick.map(x=>x.g+'='+x.u).join(',');
const a=d.draw(G,{seed:7}),b=d.draw(G,{seed:7}),c=d.draw(G,{seed:8});
A.strictEqual(key(a),key(b),'same seed, same draw');
A.notStrictEqual(key(a),key(c),'other seed, other draw');
A.deepStrictEqual(a.pick.map(x=>x.g),G.map(x=>x.g),'every group exactly once, in group order');
A.ok(a.pick.every(x=>x.u.startsWith(x.g.split(':')[1].replace(/_0$/,'_'))),'rep is a member of its own group');
// not rep-first: over 40 seeds the 12-member group draws more than its listed rep
const seen=new Set(); for(let s=1;s<=40;s++) seen.add(d.draw(G,{seed:s}).pick[11].u); A.ok(seen.size>6,'uniform-ish over the pool, not rep first: '+seen.size);
// per 2: distinct, capped by pool
const p2=d.draw(G,{seed:7,per:2}); A.strictEqual(p2.pick.filter(x=>x.g===G[0].g).length,1,'pool 1 gives 1');
for(const g of G.slice(1)){const u=p2.pick.filter(x=>x.g===g.g).map(x=>x.u);A.strictEqual(u.length,2);A.notStrictEqual(u[0],u[1]);}
// eligible filter: group 0 has none eligible -> none
const el=new Set(G.flatMap(g=>g.units).filter(u=>u!=='u0_0'&&!/_0$/.test(u)||u==='u5_0'));
const e=d.draw(G,{seed:7,eligible:el}); A.deepStrictEqual(e.none,['g01:u0_0']); A.ok(e.pick.every(x=>el.has(x.u)));
// pairs-src: a known pair is copied whole, others are made by kind
const src=[{name:'ctlpz',shooter:'pz6bh',control:true},{name:'sx_u1_0',class:'vehicle',shooter:'u1_0',foe:'pz4h',dist:300,isolate:true}];
const w=d.draw([G[1],G[3],G[4]],{seed:1,pairs:src,per:2});
const m=w.pick.find(x=>x.u==='u1_0'); A.ok(m&&!m.made&&m.p.foe==='pz4h'&&m.p.group===G[1].g,'source pair copied with group');
A.ok(w.pick.filter(x=>x.g===G[3].g).every(x=>x.made&&x.p.class==='infantry'&&x.p.foe==='mp/ger/rifle'),'infantry kind makes an infantry pair');
A.ok(w.pick.filter(x=>x.g===G[4].g).every(x=>x.p.class==='gun'&&x.p.dist===300),'gun kind, 300 units');
// games: control first, <= 8 pairs, isolate alone, every pick once per round
const gl=d.games(w.pick,{rounds:3},d.rng(5));
for(const g of gl){A.strictEqual(g.pairs[0].name,'ctlpz');A.ok(g.pairs.length<=8);if(g.pairs.some(p=>p.isolate))A.strictEqual(g.pairs.length,2,'isolate alone');A.ok(g.pairs.every(p=>p.name&&p.class&&p.shooter&&p.foe),'edrun keys');}
for(let r=1;r<=3;r++){const n=gl.filter(g=>g.file.startsWith('r'+r+'-')).flatMap(g=>g.pairs.slice(1)).map(p=>p.name).sort();A.deepStrictEqual(n,w.pick.map(x=>x.pair).sort(),'round '+r+' has each pick once');}
// sweep csv: unbuilt and name-clash rows left out, class gives kind
const cg=d.csvGroups('class,unit,group,build,nameClash\r\ngun,a,g2:a,built,\r\ngun,b,g2:a,failed,\r\nvehicle,c,g1:c,built,\r\nvehicle,e,g1:c,built,Y\r\nvehicle,f,g3:f,unfit,\r\n');
A.deepStrictEqual(cg,[{g:'g1:c',kind:'vehicle',units:['c']},{g:'g2:a',kind:'gun',units:['a']}],'csv filter');
// CLI: files, same seed same bytes, usage error
fs.writeFileSync(T+'/b.json',JSON.stringify({rows:G.flatMap(g=>g.units.map(u=>({rep:u,donor:'d_'+u,status:/_1$/.test(u)?'failed':'built'})))}));
const dn=d.readDonors(T+'/b.json'); A.strictEqual(dn.u0_0,'d_u0_0'); A.ok(!dn.u1_1,'failed build gives no donor');
const run=(o)=>d.main(['--seed','11','--groups',T+'/g.json','--out',T+'/'+o,'--insts','2,3','--donors',T+'/b.json']);
A.strictEqual(run('o1'),0); A.strictEqual(run('o2'),0);
for(const f of ['pick.json','run-list.txt','kill/r1-g1.json']) A.strictEqual(fs.readFileSync(T+'/o1/'+f,'utf8').replace(/o1/g,'o'),fs.readFileSync(T+'/o2/'+f,'utf8').replace(/o2/g,'o'),f+' same seed same bytes');
const L=fs.readFileSync(T+'/o1/run-list.txt','utf8').trim().split('\n'); A.ok(L[0].includes('--inst 2')&&L[1].includes('--inst 3')&&L[0].includes('--secs 75'),'insts alternate, 75 s');
A.strictEqual(L.length,fs.readdirSync(T+'/o1/kill').length,'one command per game file');
const LL=fs.readFileSync(T+'/o1/list.txt','utf8').trim().split('\n'); A.strictEqual(LL.length,L.length); A.ok(LL.every(f=>fs.existsSync(f)&&Array.isArray(JSON.parse(fs.readFileSync(f,'utf8')))),'list.txt names existing pair files');
const pk=JSON.parse(fs.readFileSync(T+'/o1/pick.json','utf8')); A.strictEqual(pk.pick.length,12); A.ok(!('p' in pk.pick[0]));
const un=JSON.parse(fs.readFileSync(T+'/o1/units.json','utf8')); A.deepStrictEqual(un.map(x=>x.rep),pk.pick.map(x=>x.u),'units.json follows the pick');
A.ok(un.every(x=>x.class&&(x.donor===null||x.donor==='d_'+x.rep)),'unitmod rows rep,class,donor'); A.strictEqual(un.find(x=>x.rep.startsWith('u3_')).class,'infantry');
const err=console.error; console.error=()=>{}; A.strictEqual(d.main(['--groups',T+'/g.json']),2,'no seed is usage'); A.strictEqual(d.main(['--seed','1','--groups',T+'/nope.json']),3); console.error=err;
" "$T" || { rm -rf "$T"; echo FAIL; exit 1; }
node tools/exam/test/parity.js "$T" >/dev/null || { rm -rf "$T"; echo FAIL parity; exit 1; }
rm -rf "$T"
echo PASS
