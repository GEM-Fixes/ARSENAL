// ARSENAL Editor, part jump: next / previous problem and next / previous kind of problem across the whole mod.
// The list is the whole-mod check (POST /api/x/ide/modcheck: the tree walk in the explorer's order, each text file through intel
// check, the same check as the lint route) with the open tabs' own fresh findings laid over it (the problems panel's data), so a fix
// or an edit updates the list at once and the place is kept (the next step starts from the cursor, or the last problem reached).
// Order: file in explorer order, then line, col. A kind = the finding code; kinds go by severity (error, warning), then code.
// Unchecked mod: the first step starts the check and says how far it is; the step is made as soon as the answer is sure.
// Filter (LS ide.jump.f): all, errors only, warnings only, the current kind only. Info findings are not stepped through.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML; every word through tx(). Author: Imperator_Aug (ARSENAL, mod-wide problems)
// Author: Imperator_Aug (ARSENAL, ia-3a6dc96b)
'use strict';
const script = String.raw`
(function(){
if(typeof IDE==='undefined'||!IDE||!IDE.parts||IDE.remote)return;
var MC=null,PEND=null,LAST=null,KIND=null,LIST=null,BAR=null,FILTERS=['all','error','warn','kind'];
var FKEYS=['ide.j.f.all','ide.j.f.error','ide.j.f.warn','ide.j.f.kind'];
function low(s){return String(s||'').replace(/\\/g,'/').toLowerCase()}
function filt(){var f=LS.get('ide.jump.f','all');return FILTERS.indexOf(f)>=0?f:'all'}
// explorer order: folder by folder, names by code unit (the tree route sorts each folder so)
function cmpRel(a,b){if(a===b)return 0;var x=String(a).split('/'),y=String(b).split('/'),n=Math.min(x.length,y.length);
 for(var i=0;i<n;i++){if(x[i]===y[i])continue;return x[i]<y[i]?-1:1}return x.length-y.length}
function cmpAt(a,b){return cmpRel(a.rel,b.rel)||(a.line-b.line)||((a.col||1)-(b.col||1))}
function sevRank(s){return s==='error'?0:1}
function kindId(f){return f.sev+'|'+f.code}
function cmpKind(a,b){var p=a.split('|'),q=b.split('|');return (sevRank(p[0])-sevRank(q[0]))||(p[1]<q[1]?-1:p[1]>q[1]?1:0)}
function modNow(){return S.mod||''}
function docRel(d){if(!d||d.view||!d.ref||d.ref.rel==null)return null;if(low(d.ref.mod||modNow())!==low(modNow()))return null;return d.ref.rel}
function keep(f){return f&&(f.sev==='error'||f.sev==='warn')}
// the whole list: the check's files, each open text tab of this mod with fresh findings in place of its file's entry
function all(){if(LIST)return LIST;var by={},rels=[];
 if(MC)MC.files.forEach(function(x){by[x.rel]=x.findings;rels.push(x.rel)});
 (IDE.docs||[]).forEach(function(d){var r=docRel(d);if(!r||!IDE.fresh(d)||d.fver<0)return;if(!(r in by))rels.push(r);by[r]=(d.findings||[]).filter(keep)});
 rels.sort(cmpRel);var out=[];
 rels.forEach(function(r){var fs=(by[r]||[]).slice().sort(function(a,b){return (a.line-b.line)||((a.col||1)-(b.col||1))});
  fs.forEach(function(f){out.push({rel:r,line:f.line,col:f.col||1,code:f.code,sev:f.sev,msg:f.msg,kind:kindId(f)})})});
 LIST=out;return out}
function dirty(){LIST=null;drawBar()}
function shown(){var f=filt(),a=all();if(f==='all')return a;if(f==='kind'){if(!KIND)return a;return a.filter(function(x){return x.kind===KIND})}
 return a.filter(function(x){return x.sev===f})}
function kinds(){var s={},o=[];all().forEach(function(x){if(!s[x.kind]){s[x.kind]=1;o.push(x.kind)}});return o.sort(cmpKind)}
// where the step starts: the cursor in a tab of this mod, else the last problem reached, else before the first file
function place(){var d=IDE.active(),r=docRel(d),ed=IDE.ed();if(r&&ed){var c=ed.cursor()||{line:1,col:1};return {rel:r,line:c.line,col:c.col}}
 return LAST?{rel:LAST.rel,line:LAST.line,col:LAST.col}:null}
// the check walks from the file after the one you were in and goes round: start .. upto (past the end: wrapped) is done.
// The tab you are in is known from its own check.
function sure(rel){if(!MC)return false;if(MC.done)return true;var d=IDE.active();if(d&&docRel(d)===rel&&IDE.fresh(d)&&d.fver>=0)return true;
 if(MC.upto==null||MC.start==null)return false;
 if(!MC.wrapped)return cmpRel(rel,MC.start)>=0&&cmpRel(rel,MC.upto)<=0;
 return cmpRel(rel,MC.start)>=0||cmpRel(rel,MC.upto)<=0}
function say(t){IDE.status(t)}
function progress(){if(!MC)return '';return tx('ide.j.checking',{n:MC.checked,m:MC.total==null?'?':MC.total})}
// JOBS: the check is one row of the job list in the footer (the server's background job, what job.w.modcheck); the slice asks below are
// not listed ({job:false}). Cancel there: the next slice answer says stopped (a 499 on the ask itself counts the same): the asks end,
// the strip says so, and the next step or "Check the whole mod again" starts a new check.
function halt(M){M.stopped=true;M.busy=false;PEND=null;LIST=null;say(tx('ide.j.stopped'));drawBar()}
// the page left the check's mod before the check ended: the server is told to stop its walk
function quit(M){if(!M||M.done||M.stopped||!M.job)return;try{IDE.call('/api/x/ide/modcheck',{mod:M.mod,job:M.job,stop:true},{job:false}).then(null,function(){})}catch(e){}}
// ---- the check
function start(again){var m=modNow();if(!m){say(tx('ide.noMod'));return}
 if(MC&&MC.mod===m&&!again&&!MC.stopped)return;if(MC&&MC.mod!==m)quit(MC);var p=place();MC={mod:m,stopped:false,job:null,done:false,total:null,checked:0,start:null,upto:null,wrapped:false,files:[],err:null,busy:false,again:!!again,at:p?p.rel:null};dirty();say(progress());poll()}
function poll(){var M=MC;if(!M||M.busy||M.stopped)return;M.busy=true;
 IDE.call('/api/x/ide/modcheck',{mod:M.mod,from:M.files.length,job:M.job||undefined,again:M.again||undefined,at:M.at||undefined},{job:false}).then(function(r){M.busy=false;M.again=false;if(MC!==M)return;
  if(r&&r.stopped){halt(M);return}
  if(M.job&&r.job!==M.job){M.files=[];M.job=r.job;if(r.off>0){poll();return}}
  M.job=r.job;if(r.off===M.files.length)M.files=M.files.concat(r.files||[]);M.total=r.total;M.checked=r.checked;M.upto=r.upto;M.start=r.start==null?null:r.start;M.wrapped=!!r.wrapped;M.done=!!r.done;M.err=r.error||null;dirty();
  if(M.done){var fl=M.files.map(function(x){var e=0,w=0;x.findings.forEach(function(f){if(f.sev==='error')e++;else w++});return {rel:x.rel,key:x.key,e:e,w:w}});
   IDE.emit('modcheck',{mod:M.mod,files:fl});if(M.err)say(tx('ide.j.fail',{m:M.err}))}
  if(PEND)tryPend();
  if(!M.done)setTimeout(poll,(r.files||[]).length>=2000?0:300)})
 .catch(function(e){M.busy=false;if(MC!==M)return;if(e&&e.cancelled){halt(M);return}M.err=e.message;PEND=null;say(tx('ide.j.fail',{m:e.message}));drawBar()})}
function tryPend(){var p=PEND;PEND=null;if(!p)return;step(p.dir,p.kind,true)}
// ---- steps
function step(dir,byKind,again){if(!modNow()){say(tx('ide.noMod'));return}
 if(!MC||MC.mod!==modNow()||MC.stopped)start();
 var r=byKind?kindTarget(dir):target(dir);
 if(r==='wait'){PEND={dir:dir,kind:byKind};say(progress()+' '+tx('ide.j.wait'));return}
 if(!r){say(tx(byKind?'ide.j.noKind':(filt()==='all'?'ide.j.none':'ide.j.noneF'),{f:tx(FKEYS[FILTERS.indexOf(filt())])}));return}
 go(r.it,r.wrap?tx(dir>0?'ide.j.wrapped':'ide.j.wrappedLast'):'')}
function target(dir){var L=shown(),p=place(),i,it=null;
 if(filt()==='kind'&&!KIND)return null;
 if(dir>0){for(i=0;i<L.length;i++)if(!p||cmpAt(L[i],p)>0){it=L[i];break}
  if(it)return sure(it.rel)?{it:it}:'wait';if(!MC.done)return 'wait';return L.length?{it:L[0],wrap:!!p}:null}
 for(i=L.length-1;i>=0;i--)if(p&&cmpAt(L[i],p)<0){it=L[i];break}
 if(!MC.done&&!(p&&sure(p.rel)))return 'wait';
 if(it)return {it:it};if(!MC.done)return 'wait';return L.length?{it:L[L.length-1],wrap:true}:null}
// the kind of the place: the problem at the cursor line, else the last kind stepped to
function kindHere(){var p=place();if(p){var a=all();for(var i=0;i<a.length;i++)if(a[i].rel===p.rel&&a[i].line===p.line)return a[i].kind}return KIND}
function kindTarget(dir){if(!MC.done)return 'wait';var ks=kinds(),cur=kindHere(),i=cur?ks.indexOf(cur):-1,wrap=false;if(!ks.length)return null;
 var sev=filt()==='error'||filt()==='warn'?filt():null;if(sev)ks=ks.filter(function(k){return k.split('|')[0]===sev});if(!ks.length)return null;
 if(cur)i=ks.indexOf(cur);
 var j=dir>0?i+1:(i<0?ks.length-1:i-1);if(j>=ks.length){j=0;wrap=i>=0}if(j<0){j=ks.length-1;wrap=true}
 var k=ks[j],a=all();for(var n=0;n<a.length;n++)if(a[n].kind===k)return {it:a[n],wrap:wrap};return null}
function go(it,note){LAST={rel:it.rel,line:it.line,col:it.col,code:it.code};KIND=it.kind;
 IDE.open({mod:modNow(),rel:it.rel},it.line,it.col).then(function(d){if(!d)return;var ed=IDE.ed();if(ed&&!d.view){try{ed.goto(it.line,it.col)}catch(e){}try{ed.focus()}catch(e){}}
  var t=posText(it);say((note?note+' ':'')+t+'  '+it.code+': '+it.msg);drawBar()})}
// "problem 14 of 312 . MACRO_UNDEFINED 3 of 151" (+ "checking ..." while the check runs)
function posText(it){var L=shown(),a=all(),i=-1,k=0,kn=0,ki=0;
 for(var n=0;n<L.length;n++)if(L[n]===it||(L[n].rel===it.rel&&L[n].line===it.line&&L[n].col===it.col&&L[n].code===it.code)){i=n;break}
 a.forEach(function(x){if(x.kind===it.kind){kn++;if(!ki&&x.rel===it.rel&&x.line===it.line&&x.col===it.col&&x.code===it.code)ki=kn}});
 var t=tx('ide.j.pos',{i:i+1,n:L.length,code:it.code,k:ki,m:kn});if(MC&&!MC.done)t+=' ('+progress()+')';return t}
function setFilt(f){if(FILTERS.indexOf(f)<0)f='all';if(f==='kind'&&!KIND)KIND=kindHere();LS.set('ide.jump.f',f);say(tx('ide.j.fNow',{f:tx(FKEYS[FILTERS.indexOf(f)])}));drawBar()}
// ---- the strip in the problems panel
function drawBar(){if(!BAR)return;var sel=BAR.sel;sel.value=filt();
 var a=MC?all():null;BAR.info.textContent=!MC?tx('ide.j.unchecked'):MC.stopped?tx('ide.j.stopped'):!MC.done?progress():tx('ide.j.total',{n:a.length,k:kinds().length})}
IDE.jumpBar=function(){if(BAR)return BAR.el;
 function b(k,fn,key){var x=h('button',{type:'button',class:'idp-btn ide-jb',text:tx('ide.a.'+k),'aria-keyshortcuts':key||null,onclick:fn});IDE.tip(x,'ide.a.'+k+'T',key);return x}
 var sel=h('select',{class:'ide-jsel','aria-label':tx('ide.j.fH')},FILTERS.map(function(f,i){return h('option',{value:f,text:tx(FKEYS[i])})}));
 sel.addEventListener('change',function(){setFilt(sel.value)});
 var info=h('span',{class:'idp-note ide-jinfo'});
 var el=h('div',{class:'ide-jbar',role:'group','aria-label':tx('ide.j.h')},[h('span',{class:'ide-jh',text:tx('ide.j.h')}),
  b('jPrev',function(){step(-1,false)},'Shift+Alt+F8'),b('jNext',function(){step(1,false)},'Alt+F8'),
  b('jKindPrev',function(){step(-1,true)},'Ctrl+Shift+F8'),b('jKind',function(){step(1,true)},'Ctrl+F8'),sel,info]);
 BAR={el:el,sel:sel,info:info};drawBar();return el};
// ---- events: an edit or fix re-checks the tab (lint): the list follows; a new mod drops it
IDE.on('lint',dirty);IDE.on('closed',dirty);IDE.on('opened',dirty);
IDE.on('mod',function(){quit(MC);MC=null;PEND=null;LAST=null;KIND=null;dirty()});
IDE.jump={step:step,start:function(){start(true)},list:function(){return all().slice()},shown:function(){return shown().slice()},kinds:kinds,
 state:function(){return MC?{done:MC.done,stopped:!!MC.stopped,checked:MC.checked,total:MC.total,files:MC.files.length,pending:!!PEND,err:MC.err}:null},filter:setFilt,cmpRel:cmpRel,last:function(){return LAST}};
function canJ(){return !!modNow()}
[['jNext','Alt+F8',function(){step(1,false)}],['jPrev','Shift+Alt+F8',function(){step(-1,false)}],
 ['jKind','Ctrl+F8',function(){step(1,true)}],['jKindPrev','Ctrl+Shift+F8',function(){step(-1,true)}],
 ['jFilter',null,function(){var i=FILTERS.indexOf(filt());setFilt(FILTERS[(i+1)%FILTERS.length])}],
 ['jRecheck',null,function(){start(true)}]
].forEach(function(a){IDE.action(a[0],{label:'ide.a.'+a[0],tip:'ide.a.'+a[0]+'T',key:a[1],group:'jump',run:a[2],when:canJ,bar:a[0]!=='jKindPrev'&&a[0]!=='jPrev'})});
})();
`;
const css = [
'.ide-jbar{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin-right:12px}',
'.ide-jh{font-weight:600}',
'.ide-jsel{font:inherit}',
].join('\n');
module.exports = { script, css };
