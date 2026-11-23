// Editor part "explorer": the file explorer on the left of the Editor (my mod tree, merged game view, problems).
// Contract: tools/ide/README.md (Browser). Page rules: ES5, no backtick, no dollar-brace, DOM only through h() and textContent.
// Plugs into IDE.parts.explorer(host) -> {refresh, focus, files, state}. CSS prefix idx-. state() is read only, for tests; files(mod) is
// read only, for Go to file (the whole mod list when the explorer holds it, else null).
// The tree is one flat list of rows (aria-level / posinset / setsize carry the nesting). A toggle re-renders only the toggled
// subtree; above WINAT rows only the rows near the viewport get DOM nodes, two spacers keep the scroll height.
// No file maximum: the mod tree (GET ide/tree) and a game folder (GET ide/vdir) come in pages and show as they arrive; a filter
// over the mod runs in time slices (a new keystroke stops the old run), a filter over the game view asks the server (GET ide/vfind)
// a page at a time, only for the rows in view. A filtered list keeps no row object per file: rows are made when they come into view
// and dropped when they leave it. Above LIMPX px of list height the scroll position is scaled, so the last row is still reachable.
// Author: Imperator_Aug (ARSENAL, ia-f39fe736)
var DEPTH_CSS = [];
for (var d = 0; d <= 24; d++) {
  DEPTH_CSS.push('.idx-d' + d + '>.idx-row{padding-left:' + (4 + 12 * d) + 'px}');
  DEPTH_CSS.push('.idx-imsg.idx-d' + d + '{padding-left:' + (8 + 12 * d) + 'px}');
}
module.exports = {
script: String.raw`
(function(){
if(typeof IDE==='undefined'||!IDE||!IDE.parts)return;
IDE.parts.explorer=function(host){
 var MODES=['mod','game','problems'];
 var mode=LS.get('ide.x.mode','mod');if(MODES.indexOf(mode)<0)mode='mod';
 var TREE=null,TREEMOD=null,TREEERR=null,TREELOAD=false,MODEL=null,LASTMOD=null,TL=null,TSTALE=false;
 var VD={},LDT={},LQ=[],LRUN=0,OPEN={},GOPEN={},VAN=!!LS.get('ide.x.van',false);
 var SEL=null,SELENT=null,rows=[],SRC=null,MISS=null,MOUNT=[],WIN={a:-1,b:-1,top:-1},TABE=null,LOSTF=false;
 var FJ=null,JL=[],VFALL=false,FLAT={},VKEY=null,GBZ=null,GWARN=false,MISSF=null;
 var ACTIVE=null,DIRTY={},FIND={},MCHK=null,MENU=null,LASTM={id:null,t:0},DLG=null,COMP=false,TA='',TAT=null,tmr={};
 // (merged) MRG: the "My mod" list also shows the game files the mod does not replace (LS ide.x.merged, off by default). MD = game
 // folder (path under resource/) -> its game files the mod has no copy of (GET ide/vdir vanilla=1 under=1), read when the folder opens.
 // PEND: the row id Show in the file list waits for (selected as soon as it is drawn)
 var MRG=!!LS.get('ide.x.merged',false),MD={},MDT={},PEND=null;
 // test hooks (window.IDE_XTEST, read when used): slice = ms per filter slice, limpx = list height where the scaled scroll starts
 function xt(){return (typeof window!=='undefined'&&window.IDE_XTEST)||{}}
 var WINAT=400,ROWH=20,OVER=8,MAXD=24,LIMPX=15000000,SLICE=12,LOADS=4;
 // page sizes: a game folder (first page small so its first rows show at once), the mod tree, a game search
 var PG1=1000,PG2=20000,TPG1=2000,TPG2=20000,FPG=500;

 // ---------- small helpers
 function later(k,fn,ms){clearTimeout(tmr[k]);tmr[k]=setTimeout(fn,ms)}
 function enc(s){return encodeURIComponent(s)}
 function now(){return new Date().getTime()}
 function budget(){var s=xt().slice;return typeof s==='number'?s:SLICE}
 function low(s){return String(s||'').replace(/\\/g,'/').toLowerCase()}
 function curMod(){return (typeof S!=='undefined'&&S&&S.mod)||''}
 // the mod and the page's game (S.gameId): AS64 and MoW:AS2 may share one mod folder but not one game view, so a game switch reads
 // the game tree, the mod tree and Go to file again. The calls themselves carry the game through page api() (x-arsenal-game).
 function modKey(){var g='';try{g=(typeof S!=='undefined'&&S&&S.gameId)||''}catch(e){g=''}return (g&&g!=='as64'?g+'|':'')+curMod()}
 function lsKey(p){return 'ide.x.'+p+'.'+curMod()}
 function loadOpen(){OPEN=LS.get(lsKey('open'),{})||{};GOPEN=LS.get(lsKey('gopen'),{})||{}}
 function saveOpen(){LS.set(lsKey('open'),OPEN);LS.set(lsKey('gopen'),GOPEN)}
 function chunks(s){return String(s).toLowerCase().match(/(\d+|\D+)/g)||[]}
 function cmpC(x,y){for(var i=0;i<x.length&&i<y.length;i++){if(x[i]===y[i])continue;
   if(/^\d/.test(x[i])&&/^\d/.test(y[i])){var d=parseInt(x[i],10)-parseInt(y[i],10);if(d)return d}
   return x[i]<y[i]?-1:1}
  return x.length-y.length}
 function natCmp(a,b){return cmpC(chunks(a),chunks(b))}
 // folders first, then natural name order; the name pieces are cut once per row for one sort and not kept
 function sortKids(list){var a=new Array(list.length),i;
  for(i=0;i<list.length;i++)a[i]={k:list[i],c:chunks(list[i].name),d:list[i].kind==='dir'?0:1,i:i};
  a.sort(function(x,y){return (x.d-y.d)||cmpC(x.c,y.c)||(x.i-y.i)});
  for(i=0;i<a.length;i++)list[i]=a[i].k;
  return list}
 function rxq(s){return String(s).replace(/[.*+?^$()|[\]\\{}]/g,'\\$&')}
 function push(to,from){for(var i=0;from&&i<from.length;i++)to.push(from[i])}
 function baseOf(p){return String(p||'').split('::').pop().split('/').pop()}
 // GT-39: one join for every path the explorer shows or matches: never a doubled, leading or trailing slash
 function pj(a,b){return [a,b].filter(function(x){return x!=null&&x!==''}).join('/').replace(/\\/g,'/').replace(/\/{2,}/g,'/').replace(/^\/+|\/+$/g,'')}
 function inside(el,box){while(el){if(el===box)return true;el=el.parentNode}return false}
 function after(p,fn){if(p&&typeof p.then==='function')p.then(fn,function(){});else setTimeout(fn,0)}
 function errText(e){return (e&&e.message)||String(e)}
 // JOBS (the job list in the footer): the first page of a paged walk is one named row, its later pages are not listed
 function jobOpt(more,key,p){return more?{job:false}:{what:tx(key,p)}}
 function fail(e){toast(tx('ide.x.err',{m:errText(e)}))}
 function isNoGame(m){m=String(m||'');return (typeof tx==='function'&&m===tx('game.notSet'))||/game folder/i.test(m)}
 function hasNote(r,n){return !!(r&&r.notes&&r.notes.indexOf&&r.notes.indexOf(n)>=0)}
 function sizeText(n){n=+n||0;if(n<1024)return tx('ide.x.u.b',{n:n});if(n<1048576)return tx('ide.x.u.kb',{n:(n/1024).toFixed(1)});return tx('ide.x.u.mb',{n:(n/1048576).toFixed(1)})}
 function dcl(d){return 'idx-d'+Math.min(d,MAXD)}
 function setH(el,px){var v=px+'px';if(el.style.height!==v)el.style.height=v}
 function refused(e){return !!e&&(e.status===403||e.status===404||e.status===501)}

 // ---------- DOM skeleton
 var root=h('div',{class:'idx'});
 var tabBar=h('div',{class:'idx-tabs',role:'tablist','aria-label':tx('ide.x.modes')}),tabs={};
 MODES.forEach(function(m){var b=h('button',{type:'button',role:'tab',class:'idx-tab',text:tx('ide.x.mode.'+m),onclick:function(){setMode(m)}});
  IDE.tip(b,'ide.x.mode.'+m+'.tip');tabs[m]=b;tabBar.appendChild(b)});
 tabBar.addEventListener('keydown',function(e){var i=MODES.indexOf(mode);
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){var n=MODES[(i+(e.key==='ArrowRight'?1:MODES.length-1))%MODES.length];setMode(n);tabs[n].focus();e.preventDefault()}});
 var filt=h('input',{type:'text',class:'idx-filter',placeholder:tx('ide.x.filter'),'aria-label':tx('ide.x.filter.label'),spellcheck:'false',autocomplete:'off'});
 IDE.tip(filt,'ide.x.filter.tip','/');
 var info=h('div',{class:'idx-info','aria-live':'polite'});
 var dlgBox=h('div',{class:'idx-dlgbox',hidden:true});
 var body=h('div',{class:'idx-body',role:'tree','aria-label':tx('ide.x.tree'),tabindex:'-1'});
 var topSp=h('div',{class:'idx-sp','aria-hidden':'true'}),botSp=h('div',{class:'idx-sp','aria-hidden':'true'}),tail=h('div',{class:'idx-tail'});
 var menu=h('div',{class:'idx-menu',role:'menu','aria-label':tx('ide.x.menu'),hidden:true});
 // searchKit (page.js; owner 2026-11-19: browse, indexed search and history on every search box): history 'ide.x.filter', index =
 // the folders of the list shown (the mod tree, or the game folders read so far), made once per list (kitIdx), Browse = the
 // file picker where the list's files live (My mod: the mod folder on disk; Game files and a phone: the game data, at the selected
 // row's folder); the picked file's path goes into the filter (the list narrows to it) and the file opens. arrows false: ArrowDown and
 // Enter with the kit's list shut go to the file list as before. The kit's Browse button takes the place of the old Browse button.
 var KI={k:'',t:0,a:[]},KDIR=tx('ide.x.sk.dir');
 function kitIdx(){var k=mode+'|'+modKey()+'|'+(TREE&&TREE.gen)+'|'+(MRG?1:0),t=now();if(KI.k===k&&(mode==='mod'||t-KI.t<2000))return KI.a;
  var a=[],seen={};
  function dir(p){if(!p||seen[p])return;seen[p]=1;a.push({label:p+'/',value:p+'/',hint:KDIR,lo:p.toLowerCase()+'/'})}
  if(mode==='mod'&&TREE&&TREE.files){var fs=TREE.files;for(var i=0;i<fs.length;i++){var f=fs[i];if(!f||f.state==='pak')continue;var r=String(f.rel||'').replace(/\\/g,'/'),j=r.lastIndexOf('/');
    while(j>0){var d=r.slice(0,j);if(seen[d])break;dir(d);j=d.lastIndexOf('/')}}}
  else if(mode==='game'){Object.keys(VD).forEach(function(p){var v=VD[p];if(!v||!v.dirs)return;
    v.dirs.forEach(function(n){dir(pj(p,typeof n==='string'?n:n&&n.name))})})}
  KI={k:k,t:t,a:a};return a}
 // the game folder of the selected game row (a file: its folder), '' = the top of the game files
 function selPath(){var s=String(SEL||'');if(s.indexOf('g:')!==0)return '';s=s.slice(2).replace(/^resource\//i,'');
  if(SELENT&&SELENT.it&&SELENT.it.kind==='file')s=s.slice(0,Math.max(0,s.lastIndexOf('/')));return s}
 function gameView(){return !!IDE.remote||mode==='game'}
 // the suggestions are folders only (the list under the box already shows the matching files), at most 10. browse: view and start
 // are read at each click (getters): the list on show decides where the picker opens
 var KOPT={key:'ide.x.filter',arrows:false,cap:10,
  index:function(s,done){s=String(s).toLowerCase().replace(/\\/g,'/');var a=kitIdx(),out=[],n=0;
   for(var i=0;i<a.length;i++){var x=a[i];if(x.lo.indexOf(s)>=0){n++;if(out.length<10)out.push(x)}}
   done(out,n-out.length)},
  browse:{mode:'file',start:function(){return gameView()?selPath():curMod()},
   toValue:function(p,e){if(e&&e.view==='data')return e.path||p;var r=IDE.modRel?IDE.modRel(p):null;return r!=null?r:p}},
  onPick:function(v,it,from){filt.value=v;render();if(from==='browse'&&IDE.openPicked)IDE.openPicked(it&&it.path||v,it)}};
 Object.defineProperty(KOPT.browse,'view',{enumerable:true,get:function(){return gameView()?'data':'disk'}});
 var fKit=IDE.kitOn?IDE.kitOn(filt,KOPT):null;
 if(fKit){fKit.el.className+=' idx-sk';if(fKit.browseButton)IDE.tip(fKit.browseButton,'ide.x.browseT')}
 var brw=fKit?null:h('button',{type:'button',class:'idx-btn',text:tx('ide.x.browse'),onclick:function(){if(IDE.browseFile)IDE.browseFile()}});if(brw)IDE.tip(brw,'ide.x.browseT');
 root.appendChild(tabBar);root.appendChild(h('div',{class:'idx-frow'},[fKit?fKit.el:filt,brw]));root.appendChild(info);root.appendChild(dlgBox);root.appendChild(body);
 host.appendChild(root);(document.body||root).appendChild(menu);

 // ---------- loading: the mod tree, in pages (GET ide/tree). The first look shows the rows as they come; a refresh keeps the old
 // list on screen until the new one is whole. A page from a list that was read again (its stamp changed) starts the list again once.
 function startTree(){var m=curMod();if(!m)return;TSTALE=false;
  var tok={},acc=[],B=mb(),ver=null,tries=0,last={},live=!(TREE&&TREEMOD===m&&!TREE.more);
  TL=tok;TREELOAD=true;
  function put(more,part,why){var t=live&&TREE&&TREE.tok===tok?TREE:{tok:tok,gen:0,files:null};
   if(t.files!==acc){t.files=acc;t.gen++}
   t.more=more;t.total=more?null:acc.length;t.unread=last.unread||0;t.notes=last.notes||[];t.partial=part||null;t.why=why||'';t.truncated=false;
   if(live||!more){TREE=t;TREEMOD=m;MODEL=B.top;TREEERR=null}
   if(!more){TREELOAD=false;if(TL===tok)TL=null}}
  function page(off){
   api('/api/x/ide/tree?'+q({mod:m,off:off,lim:off?TPG2:TPG1,ver:ver}),undefined,off?{job:false}:{what:tx('ide.job.tree')}).then(function(r){
    if(TL!==tok||m!==curMod())return;r=r||{};
    if(off&&r.ver!==ver){
     if(tries++<1){acc=[];B=mb();ver=null;page(0);return}
     put(false,'changed');redraw();return}
    ver=r.ver||null;last=r;var fs=r.files||[];
    push(acc,fs);mbAdd(B,fs);
    var more=r.next!=null&&fs.length>0;
    put(more,r.partial?'error':null,r.error);
    if(more)page(r.next);
    // a refresh keeps the old list on screen until the new one is whole: nothing to draw for its pages in between
    if(live||!more)redraw()},
   function(e){if(TL!==tok||m!==curMod())return;
    // a server or a phone session without the paged route: the one-answer list of the Files tab
    if(!off&&refused(e)){oldTree(m,tok);return}
    if(!acc.length){TL=null;TREELOAD=false;TREEERR=errText(e);if(mode==='mod')render();return}
    put(false,'error',errText(e));redraw()})}
  page(0)}
 function oldTree(m,tok){
  api('/api/x/files/tree?mod='+enc(m),undefined,{what:tx('ide.job.tree')}).then(function(t){if(TL!==tok||m!==curMod())return;TL=null;TREELOAD=false;
    var fs=(t&&t.files)||[],B=mb();mbAdd(B,fs);
    TREE={tok:tok,gen:1,files:fs,more:false,total:fs.length,unread:0,notes:(t&&t.notes)||[],partial:null,why:'',truncated:!!(t&&t.truncated)};TREEMOD=m;MODEL=B.top;TREEERR=null;
    if(mode==='mod')render()},
   function(e){if(TL!==tok||m!==curMod())return;TL=null;TREELOAD=false;TREEERR=errText(e);if(mode==='mod')render()})}
 // a new page of the tree: a running filter over the mod goes on with it, else the list is drawn again (an open context menu stays)
 function redraw(){if(mode!=='mod')return;
  if(word()&&FJ&&FJ.kind==='m'&&FJ.tree===TREE&&FJ.gen===TREE.gen){if(!FJ.done)later('fj',fjStep,0);fInfo();return}
  render(true)}

 // ---------- loading: a game folder, in pages (GET ide/vdir), at most LOADS folders at a time
 function loadDir(p){var old=VD[p];if(!old||old.error)VD[p]={loading:true};
  if(LDT[p])LDT[p].dead=true;
  var L={p:p,m:curMod(),dead:false,acc:null,ver:null,tries:0,keep:!!(old&&!old.error&&!old.loading&&!old.more)};LDT[p]=L;
  LQ.push(L);pump()}
 function pump(){while(LRUN<LOADS&&LQ.length){var L=LQ.shift();if(L.dead)continue;LRUN++;vpage(L,0)}}
 function vdone(L){LRUN=Math.max(0,LRUN-1);if(LDT[L.p]===L)delete LDT[L.p];pump()}
 function killLoads(){Object.keys(LDT).forEach(function(p){LDT[p].dead=true});LDT={};LQ=[]}
 function vpage(L,off){
  api('/api/x/ide/vdir?'+q({mod:L.m,dir:L.p,vanilla:VAN?'1':null,off:off,lim:off?PG2:PG1,ver:L.ver}),undefined,jobOpt(off,'ide.job.vdir',{p:'resource'+(L.p?'/'+L.p:'')})).then(function(r){
   if(L.dead||L.m!==curMod()){vdone(L);return}r=r||{};
   if(off&&r.ver!==L.ver){
    if(L.tries++<1){L.acc=null;L.ver=null;vpage(L,0);return}
    L.acc.more=false;L.acc.partial='changed';VD[L.p]=L.acc;vdone(L);dirDone(L.p);return}
   if(!L.acc)L.acc={dirs:[],files:[],total:0,more:true,partial:null,notes:r.notes,kids:null};
   var a=L.acc,nd=(r.dirs||[]).length+(r.files||[]).length;L.ver=r.ver||null;
   push(a.dirs,r.dirs);push(a.files,r.files);a.notes=r.notes;
   a.total=r.total!=null?r.total:a.dirs.length+a.files.length;
   a.more=r.next!=null&&nd>0;
   if(!L.keep||!a.more)VD[L.p]=a;
   if(a.more)vpage(L,r.next);else vdone(L);
   if(VD[L.p]===a)dirDone(L.p)},
  function(e){if(L.dead||L.m!==curMod()){vdone(L);return}
   if(!L.acc)VD[L.p]={error:errText(e)};else{L.acc.more=false;L.acc.partial='error';L.acc.why=errText(e);VD[L.p]=L.acc}
   vdone(L);dirDone(L.p)})}
 // a page of a game folder came: the folder's rows are drawn again (an open context menu stays). A list that ended partial draws the
 // whole view, so the info line gets its Try again button.
 function dirDone(p){if(mode!=='game')return;if(word()){if(VFALL)render(true);return}
  var r=VD[p];if(p===''||(r&&r.partial)||GWARN){render(true);return}
  for(var i=0;i<rows.length;i++){var e=rows[i];if(e&&e.it.lazy&&e.it.path===p){if(isOpen(e.it,e.depth))resub(e,true);else busyAttr(e);break}}
  gBusy()}
 // a game folder still arriving: aria-busy on its row, and the count in the info line (aria-live), so it is seen and heard at the top
 function busyAttr(e){if(!e||!e.el||!e.it.lazy)return;var r=VD[e.it.path],b=!!(r&&r.more);
  if(b||e.el.getAttribute('aria-busy'))e.el.setAttribute('aria-busy',b?'true':'false')}
 function gBusy(){if(!GBZ)return;var n=0,t=0;
  Object.keys(VD).forEach(function(p){var r=VD[p];if(!r||!r.more||!(p===''||GOPEN[p]))return;n+=(r.dirs||[]).length+(r.files||[]).length;t+=r.total||0});
  GBZ.textContent=t?tx('ide.x.g.more',{n:n,t:t}):''}
 function resetForMod(){LASTMOD=modKey();TREE=null;TREEMOD=null;TREEERR=null;TREELOAD=false;TL=null;MODEL=null;killLoads();VD={};mdKill();stopFJ();VFALL=false;
  SEL=null;SELENT=null;MCHK=null;closeDlg(false);loadOpen()}
 function reload(){if(!curMod())return;if(TREE||TREEERR)startTree();
  // (merged) a file copied into the mod leaves the game rows: the open folders' game files are read again
  if(MRG){var mo=Object.keys(MD);mdKill();if(mode==='mod')mo.forEach(function(g){mdLoad(g)})}
  if(FJ&&FJ.kind==='m'&&FJ.g)stopFJ();
  Object.keys(VD).forEach(function(p){if(p===''||GOPEN[p])loadDir(p);else delete VD[p]});
  if(FJ&&FJ.kind==='g'){stopFJ();if(mode==='game')render()}
  if(mode==='problems')render()}

 // ---------- models
 function fileItem(f,name){var st=f.state;
  return {kind:'file',name:name,id:'m:'+f.rel,f:f,rel:f.rel,key:f.key||null,state:st,ro:false,mine:true,ref:{rel:f.rel},title:f.rel}}
 // the mod tree is built page by page; a folder sorts its rows the first time it is shown after new ones came in
 function mb(){return {top:{kids:[],map:Object.create(null),srt:false}}}
 function mbAdd(B,files){var top=B.top;
  function dirOf(par,name,id,pak){var d=par.map[name];
   if(!d){d={kind:'dir',name:name,id:'m:'+id,path:id,kids:[],map:Object.create(null),pak:false,ro:!!par.ro,inner:id.indexOf('::')>=0,srt:false};par.map[name]=d;par.kids.push(d);par.srt=false}
   if(pak){d.pak=true;d.ro=true}return d}
  for(var j=0;j<files.length;j++){var f=files[j],sp=String(f.rel).split('::'),parts=sp[0].split('/'),node=top,acc='',i;
   var last=(sp.length>1||f.state==='pak')?parts.length:parts.length-1;
   for(i=0;i<last;i++){acc=acc?acc+'/'+parts[i]:parts[i];node=dirOf(node,parts[i],acc,i===parts.length-1)}
   if(f.state==='pak'&&sp.length<2){node.f=f;node.key=null;node.title=f.rel;continue}
   if(sp.length>1){var inner=sp[1].split('/');acc=sp[0]+'::';
    for(i=0;i<inner.length-1;i++){acc=acc+(i?'/':'')+inner[i];node=dirOf(node,inner[i],acc,false)}
    node.kids.push(fileItem(f,inner[inner.length-1]));node.srt=false;continue}
   node.kids.push(fileItem(f,parts[parts.length-1]));node.srt=false}}
 function gfileItem(f,dir){var where=f.where||'vanilla',mine=where==='mine',key=f.key||'';
  var rel=mine&&/^resource\//.test(key)?key:null;
  if(f.idx!=null)return {kind:'file',name:f.name,id:'g:'+key,f:f,key:key,rel:null,mine:false,ro:true,ref:{key:key,idx:f.idx},where:'vanilla',layer:f.layer,title:key};
  return {kind:'file',name:f.name,id:'g:'+key,f:f,key:key||null,rel:rel,mine:mine,ro:!rel,ref:rel?{rel:rel}:{key:key},where:where,layer:f.layer,title:key||pj(dir,f.name)}}
 // the rows of one game folder, made once per answer row (new pages add to them) and sorted when new ones came in
 function gameKids(p){var r=VD[p];if(!r.kids){r.kids=[];r.kd=0;r.kf=0;r.srt=true}
  var ds=r.dirs||[],fs=r.files||[];
  for(;r.kd<ds.length;r.kd++){var cp=pj(p,ds[r.kd]);r.kids.push({kind:'dir',name:ds[r.kd],id:'g:'+cp,path:cp,lazy:true,title:cp});r.srt=false}
  for(;r.kf<fs.length;r.kf++){r.kids.push(gfileItem(fs[r.kf],p));r.srt=false}
  if(!r.srt){sortKids(r.kids);r.srt=true}
  return r.kids}
 // ---------- (merged) the game files the mod does not replace, folder by folder, in the "My mod" list
 // gdirOf: the mod folder's path under resource/ ('' for resource itself); null for a folder the game does not read (outside
 // resource/, inside a pak)
 function gdirOf(p){p=String(p||'');if(p.indexOf('::')>=0)return null;var l=p.toLowerCase();if(l==='resource')return '';return l.indexOf('resource/')===0?p.slice(9):null}
 function mdKill(){Object.keys(MDT).forEach(function(g){MDT[g].dead=true});MDT={};MD={}}
 function mdLoad(g){if(MD[g]&&!MD[g].error)return;if(MDT[g])return;var m=curMod(),L={dead:false,acc:{dirs:[],files:[],more:true}};MDT[g]=L;MD[g]={loading:true};
  function page(off,ver,tries){
   api('/api/x/ide/vdir?'+q({mod:m,dir:g,vanilla:'1',under:'1',off:off,lim:off?PG2:PG1,ver:ver}),undefined,jobOpt(off,'ide.job.vdir',{p:'resource'+(g?'/'+g:'')})).then(function(r){
    if(L.dead||m!==curMod())return;r=r||{};
    if(off&&r.ver!==ver){if(tries<1){L.acc={dirs:[],files:[],more:true};page(0,null,tries+1);return}L.acc.more=false;L.acc.partial='changed';MD[g]=L.acc;delete MDT[g];mdDone(g);return}
    push(L.acc.dirs,r.dirs);push(L.acc.files,r.files);var nd=(r.dirs||[]).length+(r.files||[]).length;
    L.acc.more=r.next!=null&&nd>0;L.acc.total=r.total||0;L.acc.gen=(L.acc.gen||0)+1;MD[g]=L.acc;
    if(L.acc.more)page(r.next,r.ver||null,tries);else delete MDT[g];
    mdDone(g)},
   function(e){if(L.dead||m!==curMod())return;delete MDT[g];
    if(L.acc.files.length||L.acc.dirs.length){L.acc.more=false;L.acc.partial='error';L.acc.why=errText(e);MD[g]=L.acc}else MD[g]={error:errText(e)};mdDone(g)})}
  page(0,null,0)}
 function mdDone(){if(mode!=='mod'||!MRG||word())return;later('md',function(){render(true)},30)}
 function mgItem(f,p){var pk=f.pak?tx('ide.x.mg.pak',{p:f.pak}):tx('ide.x.mg.loose');
  return {kind:'file',name:f.name,id:'mg:'+f.key,f:f,key:f.key,rel:null,mine:false,ro:true,game:true,ref:{key:f.key,idx:f.idx},where:'vanilla',layer:f.layer,title:f.key+'  ('+pk+')'}}
 function mgDir(par,name){var p=pj(par.path,name);return {kind:'dir',name:name,id:'m:'+p,path:p,kids:[],map:Object.create(null),pak:false,ro:true,inner:false,srt:true,mg:true,title:p}}
 // a mod folder's rows with the game ones added: its own rows, then game folders and files it has no copy of (names compared without
 // case, as the game reads them). The list is made again only when either side got new rows.
 function mkids(it){if(!it.srt){sortKids(it.kids);it.srt=true}
  var g=gdirOf(it.path);if(g==null||it.pak||it.inner)return it.kids;
  var r=MD[g];if(!r){mdLoad(g);r=MD[g]}
  if(!r||r.loading||r.error)return it.kids;
  var sig=it.kids.length+'|'+(r.gen||0)+'|'+r.files.length;if(it.mk&&it.mksig===sig)return it.mk;
  var have=Object.create(null),mk=it.kids.slice(),old=Object.create(null),i;
  for(i=0;i<it.kids.length;i++)have[String(it.kids[i].name).toLowerCase()]=1;
  (it.mk||[]).forEach(function(k){if(k.mg)old[k.name]=k});
  for(i=0;i<r.dirs.length;i++){var d=r.dirs[i];if(!have[d.toLowerCase()])mk.push(old[d]||mgDir(it,d))}
  for(i=0;i<r.files.length;i++){var f=r.files[i];if(!have[String(f.name).toLowerCase()])mk.push(mgItem(f,it.path))}
  sortKids(mk);it.mk=mk;it.mksig=sig;return mk}
 // the top of the merged list: a mod with no resource folder still gets one, for the game files
 function mtop(top){if(!MRG)return top.kids;
  for(var i=0;i<top.kids.length;i++)if(String(top.kids[i].name).toLowerCase()==='resource')return top.kids;
  if(!top.mgr)top.mgr=mgDir({path:''},'resource');return sortKids(top.kids.concat([top.mgr]))}
 function mdCount(){var n=0;Object.keys(MD).forEach(function(g){var r=MD[g];if(r&&r.files&&isMdOpen(g))n+=r.files.length});return n}
 function isMdOpen(g){var p=g?'resource/'+g:'resource';for(var k in OPEN)if(OPEN[k]&&k.toLowerCase()===p.toLowerCase())return true;return g===''}
 // what a folder still owes: more rows on their way, or a list that is not whole
 function dirNote(r,put){if(r.more)put('ide.x.g.more',{n:(r.dirs||[]).length+(r.files||[]).length,t:r.total||0},'idx-busy');
  if(r.partial==='changed')put('ide.x.part.changed',null,'idx-warn');else if(r.partial==='error')put('ide.x.part.err',{m:r.why||''},'idx-warn')}

 // ---------- flat rows (no DOM): ent = {it, depth, parent, pos, size, ix, el?, gone?}
 function isOpen(it,depth){if(it.lazy)return !!GOPEN[it.path];var v=OPEN[it.path];return v===undefined?(depth===0&&!it.pak):!!v}
 function msgEnt(key,p,cls,depth,parent){return {it:{kind:'msg',id:null,key:key,p:p,cls:cls||''},depth:depth,parent:parent,el:null}}
 function flat(items,depth,parent,out){
  for(var i=0;i<items.length;i++){var it=items[i],ent={it:it,depth:depth,parent:parent,pos:i+1,size:items.length,el:null};out.push(ent);
   if(it.kind==='dir'&&isOpen(it,depth))kidsFlat(ent,out)}
  return out}
 function kidsFlat(ent,out){var it=ent.it,d=ent.depth+1;busyAttr(ent);
  if(!it.lazy){
   if(MRG&&mode==='mod'&&!SRC){var ks=mkids(it),g=gdirOf(it.path),mr=g==null?null:MD[g];
    if(ks.length)flat(ks,d,ent,out);
    if(mr&&mr.loading)out.push(msgEnt('ide.x.loading',null,'',d,ent));
    else if(mr&&mr.error)out.push(msgEnt('ide.x.err',{m:mr.error},'idx-err',d,ent));
    else if(!ks.length)out.push(msgEnt('ide.x.emptydir',null,'',d,ent));
    if(mr&&!mr.loading&&!mr.error)dirNote(mr,function(key,p,cls){out.push(msgEnt(key,p,cls,d,ent))});
    return}
   if(!it.kids.length)out.push(msgEnt('ide.x.emptydir',null,'',d,ent));else{if(!it.srt){sortKids(it.kids);it.srt=true}flat(it.kids,d,ent,out)}return}
  var r=VD[it.path];
  if(!r){loadDir(it.path);r=VD[it.path]}
  if(r.loading){out.push(msgEnt('ide.x.loading',null,'',d,ent));return}
  if(r.error){out.push(msgEnt('ide.x.err',{m:r.error},'idx-err',d,ent));return}
  var k=gameKids(it.path);if(!k.length&&!r.more)out.push(msgEnt('ide.x.emptydir',null,'',d,ent));else flat(k,d,ent,out);
  dirNote(r,function(key,p,cls){out.push(msgEnt(key,p,cls,d,ent))})}
 function reindex(from){for(var i=from||0;i<rows.length;i++)rows[i].ix=i}
 function isNav(e){return !!e&&e.it.kind!=='msg'}
 function mounted(e){return !!(e&&e.el&&e.el.parentNode===body)}
 // a row of a filtered list is made when it is first needed (SRC.at); the other lists hold every row
 function row(i){var e=rows[i];if(e||!SRC||i<0||i>=rows.length)return e||null;var it=SRC.at(i);if(!it)return null;
  e={it:it,depth:0,parent:null,pos:i+1,size:SRC.n,el:null,ix:i};rows[i]=e;return e}

 // ---------- doc state (problems, dirty, active) + the last whole-mod check
 function probOf(d){var fs=FIND[d.id]||d.findings||[],e=0,w=0,first=null;
  fs.forEach(function(x){if(x.sev==='error')e++;else if(x.sev==='warn')w++;else return;
   if(!first||x.line<first.line||(x.line===first.line&&(x.col||1)<(first.col||1)))first=x});
  return {e:e,w:w,first:first}}
 function isDirty(d){if(typeof d.dirty==='boolean')return d.dirty||!!DIRTY[d.id];return !!DIRTY[d.id]}
 function docIndex(){var byRel={},byKey={};
  (IDE.docs||[]).forEach(function(d){var p=probOf(d),x={d:d,e:p.e,w:p.w,dirty:isDirty(d),active:!!(ACTIVE&&ACTIVE.id===d.id)};
   if(d.rel)byRel[d.rel]=x;if(d.key)byKey[d.key]=x});
  return {rel:byRel,key:byKey}}
 function sevE(s){return /^(error|crash|silent|fatal)$/i.test(String(s||''))}
 function sevW(s){return /^(warn|warning|review)$/i.test(String(s||''))}
 function setMC(d){if(!d||(d.mod&&low(d.mod)!==low(curMod())))return;var mc={rel:{},key:{}},mp=low(curMod()).replace(/\/+$/,'')+'/';
  (d.files||d.findings||[]).forEach(function(x){if(!x)return;var rel=x.rel?low(x.rel):null,key=x.key?low(x.key):null;
   if(!rel&&x.file){var f=low(x.file);if(f.indexOf(mp)===0)rel=f.slice(mp.length)}
   if(!rel&&!key)return;
   var e=x.e!=null?(+x.e||0):(sevE(x.sev)?1:0),w=x.w!=null?(+x.w||0):(sevW(x.sev)?1:0);if(!e&&!w)return;
   [[mc.rel,rel],[mc.key,key]].forEach(function(p){if(!p[1])return;var o=p[0][p[1]]||(p[0][p[1]]={e:0,w:0});o.e+=e;o.w+=w})});
  MCHK=mc}
 function mcFromLint(doc){if(!MCHK||!doc)return;var p=probOf(doc);
  [[MCHK.rel,doc.rel],[MCHK.key,doc.key]].forEach(function(q){if(!q[1])return;var k=low(q[1]);if(p.e||p.w)q[0][k]={e:p.e,w:p.w};else delete q[0][k]})}
 function decoOne(ent,di){if(!ent.deco||!ent.el)return;var it=ent.it,x=null,c=null;
  if(it.doc)x=di.key[it.doc.key]||di.rel[it.doc.rel]||{d:it.doc,e:it.p.e,w:it.p.w,dirty:isDirty(it.doc),active:!!(ACTIVE&&ACTIVE.id===it.doc.id)};
  else if(mode==='mod')x=it.game?(it.key&&di.key[it.key])||null:di.rel[it.rel]||null;
  else x=(it.key&&di.key[it.key])||(it.rel&&di.rel[it.rel])||null;
  if(!x&&MCHK&&it.kind==='file')c=(it.rel&&MCHK.rel[low(it.rel)])||(it.key&&MCHK.key[low(it.key)])||null;
  var e=x?x.e:c?c.e:0,w=x?x.w:c?c.w:0,dirty=!!(x&&x.dirty),act=!!(x&&x.active);
  var sig=(dirty?'d':'')+'|'+e+'|'+w+'|'+(x?'o':'c');
  if(ent.dsig!==sig){ent.dsig=sig;var dc=ent.deco;dc.textContent='';
   if(dirty){var u=h('span',{class:'idx-dot idx-dirty'});IDE.tip(u,'ide.x.dot.dirty');dc.appendChild(u)}
   if(e||w){var p=h('span',{class:'idx-dot '+(e?'idx-dot-e':'idx-dot-w')+(x?'':' idx-dot-c')});IDE.tip(p,x?(e?'ide.x.dot.err':'ide.x.dot.warn'):(e?'ide.x.dot.cerr':'ide.x.dot.cwarn'));dc.appendChild(p)}}
  var asig=act?'a':'';
  if(ent.asig!==asig){ent.asig=asig;ent.el.className=ent.el.className.replace(/\s*idx-active\b/g,'')+(act?' idx-active':'')}}
 function decorate(){var di=docIndex();MOUNT.forEach(function(e){decoOne(e,di)})}

 // ---------- rows
 function msg(box,key,p,cls){var d=h('div',{class:'idx-msg'+(cls?' '+cls:''),role:'none',text:tx(key,p)});box.appendChild(d);return d}
 function nameEl(it){var s=h('span',{class:'idx-name'});
  if(it.hl){var lo=it.name.toLowerCase(),i=lo.indexOf(it.hl);
   if(i>=0){if(i)s.appendChild(document.createTextNode(it.name.slice(0,i)));
    s.appendChild(h('mark',{class:'idx-hit',text:it.name.slice(i,i+it.hl.length)}));
    if(i+it.hl.length<it.name.length)s.appendChild(document.createTextNode(it.name.slice(i+it.hl.length)));return s}}
  s.textContent=it.name;return s}
 function tagsOf(it){var out=[];
  function tag(cls,text,tip){var t=h('span',{class:'idx-tag '+cls,text:text});IDE.tip(t,tip);out.push(t)}
  if(it.doc){if(it.p.e)tag('idx-t-e',String(it.p.e),'ide.x.p.e.tip');if(it.p.w)tag('idx-t-w',String(it.p.w),'ide.x.p.w.tip');return out}
  if(it.kind==='dir'){if(it.pak)tag('idx-t-pak',tx('ide.x.pak'),'ide.x.pak.tip');return out}
  // a file that opens in a viewer (ext view: sound, picture, bytes ...): a small mark with the viewer's name
  var vk=viewOf(it);if(vk)tag('idx-k',window.VIEW.label(vk),'ide.x.k.tip');
  if(it.state){tag('idx-b-'+it.state,tx('ide.x.st.'+it.state),'ide.x.st.'+it.state+'.tip');return out}
  if(it.where){var t=it.where==='othermod'&&it.layer&&!/^\d+$/.test(String(it.layer))?String(it.layer):tx('ide.x.w.'+it.where);
   tag('idx-w-'+it.where,t,'ide.x.w.'+it.where+'.tip')}
  return out}
 function viewOf(it){var V=window.VIEW;if(!V||!V.kindOf||it.doc||it.kind==='dir')return null;try{return V.kindOf(it.rel||it.key||it.name,it.key||'')||null}catch(e){return null}}
 function twText(open){return String.fromCharCode(open?0x25be:0x25b8)}
 function mkRow(ent,di){var it=ent.it,el;
  // a note row is one line (cut with an ellipsis in a narrow side bar): the whole text is its tooltip
  if(it.kind==='msg'){var mt=tx(it.key,it.p);el=h('div',{class:'idx-item idx-imsg '+dcl(ent.depth)+(it.cls?' '+it.cls:''),role:'none',text:mt,title:mt});el.idxEnt=ent;ent.el=el;return el}
  // a row of a game search whose page is still on its way: it can be selected and moved over, it opens nothing
  if(it.kind==='wait'){el=h('div',{role:'treeitem',class:'idx-item idx-imsg idx-wait '+dcl(0),'aria-busy':'true','aria-level':'1','aria-setsize':String(ent.size),'aria-posinset':String(ent.pos),tabindex:'-1','aria-selected':'false',text:tx('ide.x.wait')});
   el.idxEnt=ent;ent.el=el;ent.rv='';return el}
  var dir=it.kind==='dir',open=dir&&isOpen(it,ent.depth);
  el=h('div',{role:'treeitem',class:'idx-item '+dcl(ent.depth)+(it.ro?' idx-ro':'')+(it.game||it.mg?' idx-game':''),'aria-level':String(ent.depth+1),'aria-setsize':String(ent.size),'aria-posinset':String(ent.pos),tabindex:'-1','aria-selected':'false'});
  if(dir)el.setAttribute('aria-expanded',open?'true':'false');
  if(it.lazy&&VD[it.path]&&VD[it.path].more)el.setAttribute('aria-busy','true');
  if(it.doc)el.setAttribute('aria-label',it.name+', '+tx('ide.x.p.counts',{e:it.p.e,w:it.p.w}));
  var tw=h('span',{class:'idx-tw','aria-hidden':'true',text:dir?twText(open):''});
  var deco=h('span',{class:'idx-deco'});
  el.appendChild(h('div',{class:'idx-row',title:it.title||it.name},[tw,nameEl(it),deco].concat(tagsOf(it))));
  ent.el=el;ent.tw=tw;ent.deco=deco;ent.rv='';el.idxEnt=ent;
  if(dir)tw.addEventListener('click',function(e){e.stopPropagation();select(ent);toggle(ent,!isOpen(it,ent.depth))});
  decoOne(ent,di);
  return el}

 // ---------- the window of rows in view. Virtual position V (row i at i*ROWH) = scrollTop * k; k = 1 up to LIMPX px of list,
 // above that the scroll height stays LIMPX and k grows, so every row (the last one too) can be scrolled to.
 function viewH(){return body.clientHeight||600}
 function ratio(h){var f=rows.length*ROWH;return f>LIMPX&&LIMPX>h?(f-h)/(LIMPX-h):1}
 function range(st){var n=rows.length;if(n<=WINAT)return {a:0,b:n,top:0};
  var hh=viewH();if(st==null)st=body.scrollTop||0;
  var k=ratio(hh),V=st*k,a0=Math.min(Math.max(0,n-1),Math.floor(V/ROWH));
  var a=Math.max(0,a0-OVER),b=Math.min(n,Math.ceil((V+hh)/ROWH)+OVER);
  if(a>=b)a=Math.max(0,n-Math.ceil(hh/ROWH)-OVER);
  var top=k===1?a*ROWH:Math.max(0,Math.round(st-(V-a0*ROWH)-(a0-a)*ROWH));
  return {a:a,b:b,top:top}}
 function setSp(r){var n=rows.length,tot=ratio(viewH())===1?n*ROWH:LIMPX;WIN.top=r.top;
  setH(topSp,r.top);setH(botSp,Math.max(0,tot-r.top-(r.b-r.a)*ROWH))}
 function unmount(e){if(e.el&&e.el.parentNode===body){if(document.activeElement===e.el)LOSTF=true;body.removeChild(e.el)}if(e.gone)e.el=null}
 // mount rows[a..b) between the spacers; rows already in place stay untouched. A filtered list lets go of rows out of view.
 function updWin(force,st){var r=range(st),a=r.a,b=r.b,i,e;
  if(!force&&a===WIN.a&&b===WIN.b){if(r.top!==WIN.top)setSp(r);return}
  WIN={a:a,b:b,top:r.top};
  var keep=[];
  for(i=0;i<MOUNT.length;i++){e=MOUNT[i];
   if(!e.gone&&e.ix>=a&&e.ix<b&&rows[e.ix]===e&&mounted(e))keep.push(e);
   else{if(SRC&&e!==SELENT&&rows[e.ix]===e&&(e.ix<a||e.ix>=b)){rows[e.ix]=undefined;e.gone=true}unmount(e)}}
  var p=0,di=null,mm=[];
  for(i=a;i<b;i++){e=row(i);if(!e)continue;mm.push(e);
   if(SRC&&e.size!==SRC.n){e.size=SRC.n;if(e.el)e.el.setAttribute('aria-setsize',String(SRC.n))}
   if(keep[p]===e){p++;continue}
   if(!di)di=docIndex();
   if(!e.el)mkRow(e,di);else decoOne(e,di);
   body.insertBefore(e.el,p<keep.length?keep[p].el:botSp)}
  MOUNT=mm;
  setSp(r);
  roving();
  if(LOSTF){LOSTF=false;var c=cur();if(mounted(c))c.el.focus();else if(body.focus)body.focus()}}
 // re-render only the rows under one folder
 function resub(ent,keep){if(SRC||rows[ent.ix]!==ent||ent.gone){render(keep);return}
  var i=ent.ix,j=i+1,k;while(j<rows.length&&rows[j].depth>ent.depth)j++;
  for(k=i+1;k<j;k++)rows[k].gone=true;
  var add=[];if(isOpen(ent.it,ent.depth))kidsFlat(ent,add);
  rows=rows.slice(0,i+1).concat(add,rows.slice(j));
  reindex(i);
  if(ent.el&&ent.it.kind==='dir'){var o=isOpen(ent.it,ent.depth);ent.el.setAttribute('aria-expanded',o?'true':'false');ent.tw.textContent=twText(o);busyAttr(ent)}
  updWin(true);gBusy();if(PEND)trySel()}
 // keep: drawn again because new rows came (not by the user), so an open context menu stays open with its focus
 function render(keep){
  var hadFocus=inside(document.activeElement,body)||(!!MENU&&inside(document.activeElement,menu)),st=body.scrollTop||0;
  if(MENU&&keep!==true)closeMenu(false);
  GBZ=null;MISSF=null;GWARN=false;
  LIMPX=xt().limpx||15000000;
  if(LASTMOD!==modKey())resetForMod();
  MODES.forEach(function(m){tabs[m].setAttribute('aria-selected',m===mode?'true':'false');tabs[m].setAttribute('tabindex',m===mode?'0':'-1')});
  filt.hidden=mode==='problems';if(fKit){fKit.el.hidden=filt.hidden;if(filt.hidden)fKit.close()}
  // another view (mode, filter word, mod) starts at its top; the same view drawn again (new rows came) keeps its place
  var vk=mode+'|'+word()+'|'+curMod();if(vk!==VKEY){VKEY=vk;st=0}
  body.textContent='';info.textContent='';tail.textContent='';rows=[];SRC=null;MISS=null;MOUNT=[];WIN={a:-1,b:-1,top:-1};SELENT=null;TABE=null;
  if(!word())stopFJ();
  var items=null;
  if(!curMod())msg(body,'ide.x.nomod');
  else items=mode==='mod'?renderMod():mode==='game'?renderGame():renderProblems();
  if(items===FLAT){rows=new Array(SRC.n);body.appendChild(topSp);body.appendChild(botSp);body.appendChild(tail);
   if(FJ&&FJ.done&&!SRC.n)msg(tail,'ide.x.f.none');
   updWin(true,st);body.scrollTop=st}
  else if(items){rows=flat(items,0,null,[]);reindex(0);body.appendChild(topSp);body.appendChild(botSp);body.appendChild(tail);updWin(true,st);body.scrollTop=st}
  // focus that was on a row (or in a menu closed here) goes to the selected row; focus in a menu that stays open stays there
  if(hadFocus&&!(MENU&&inside(document.activeElement,menu))&&!focusSel()&&body.focus)body.focus();
  if(PEND)trySel()}
 // the typed path is matched in the same form the rows use: forward slashes, no doubled or leading slash; game rows have no
 // "resource/" in front, so a typed "resource/" is dropped there
 function word(){if(filt.hidden)return '';var w=filt.value.trim().toLowerCase().replace(/\\/g,'/').replace(/\/{2,}/g,'/').replace(/^\/+/,'');
  if(mode==='game')w=w.replace(/^resource\//,'');return w}
 function warn(text,retry){info.appendChild(document.createTextNode(' '));info.appendChild(h('span',{class:'idx-warn',text:text}));
  if(retry){var b=h('button',{type:'button',class:'idx-btn idx-mini',text:tx('ide.x.retry'),onclick:function(){reload()}});info.appendChild(b)}}
 // what the mod list still owes: rows that could not be read, a list that changed while it was read
 function treeWarn(){if(!TREE)return;
  if(TREE.truncated)warn(tx('ide.x.truncated'));
  if(TREE.unread)warn(tx('ide.x.part.unread',{n:TREE.unread}));
  if(TREE.partial==='changed')warn(tx('ide.x.part.changed'),true);else if(TREE.partial==='error')warn(tx('ide.x.part.err',{m:TREE.why||''}),true)}
 function renderMod(){var m=curMod(),w=word();
  if(!TREE||TREEMOD!==m){
   if(TREEERR){msg(body,'ide.x.err',{m:TREEERR},'idx-err');body.appendChild(h('button',{type:'button',class:'idx-btn',text:tx('ide.x.retry'),onclick:function(){TREEERR=null;startTree();render()}}));return null}
   if(!TREELOAD)startTree();msg(body,'ide.x.loading');return null}
  mgBox();
  if(w)return filterMod(w);
  var files=TREE.files||[];
  info.appendChild(h('span',{class:TREE.more?'idx-busy':'',text:TREE.more?tx('ide.x.more',{n:files.length}):MRG?tx('ide.x.mg.count',{n:modCount(),m:mdCount()}):tx('ide.x.count',{n:files.length})}));
  treeWarn();
  if(!files.length&&!MRG){msg(body,TREE.more?'ide.x.loading':'ide.x.empty');return null}
  var top=MODEL;if(!top.srt){sortKids(top.kids);top.srt=true}
  return mtop(top)}
 // (merged) the toggle at the top of the "My mod" list
 function mgBox(){var b=h('input',{type:'checkbox'});b.checked=MRG;
  b.addEventListener('change',function(){MRG=!!b.checked;LS.set('ide.x.merged',MRG);mdKill();stopFJ();render()});
  var l=h('label',{class:'idx-van idx-mgbox'},[b,h('span',{text:' '+tx('ide.x.mg')})]);IDE.tip(l,'ide.x.mg.tip');info.appendChild(l);info.appendChild(document.createTextNode(' '))}
 // the mod's own files (pak rows themselves left out, their entries counted)
 function modCount(){var fs=TREE&&TREE.files||[],n=0;for(var i=0;i<fs.length;i++)if(fs[i].state!=='pak')n++;return n}

 // ---------- the filter. FJ = the running look: kind 'm' (my mod, in slices here), 'g' (the game view, the server looks), 'l' (the
 // folders already read, when the server has no search). A new word stops the old look at once.
 function stopFJ(){if(FJ){FJ.dead=true;if(FJ.ctl)FJ.ctl.forEach(function(c){try{c.abort()}catch(e){}})}FJ=null;clearTimeout(tmr.fj)}
 function newJob(J){stopFJ();J.t0=now();J.ms=0;J.done=false;J.dead=false;FJ=J;JL.push(J);if(JL.length>8)JL.shift();return J}
 function fInfo(){var J=FJ;if(!J||!word())return;info.textContent='';
  if(J.kind==='l'){info.appendChild(h('span',{text:tx('ide.x.g.fnote')}));return}
  var n=cnt(J),gm=J.kind==='m'&&J.g&&J.done&&J.g.total!=null;
  info.appendChild(gm?h('span',{text:tx('ide.x.mg.fcount',{n:J.hits.length,m:J.g.total})}):J.done?h('span',{text:tx('ide.x.f.count',{n:n})}):h('span',{class:'idx-busy',text:tx('ide.x.f.look',{n:n})}));
  if(J.err)warn(tx('ide.x.part.err',{m:J.err}));
  if(J.g&&J.g.err)warn(tx('ide.x.part.err',{m:J.g.err}));
  if(J.partial==='changed')warn(tx('ide.x.part.changed'),true);
  if(J.kind==='m')treeWarn()}
 // rows of a look: a merged look over my mod lists its mod hits, then (once those are all found) the game files not overwritten
 function cnt(J){return J.kind==='m'?J.hits.length+(J.g&&J.done&&J.g.total?J.g.total:0):(J.total||0)}
 // the hit count grew or the look ended: the list takes the new length, the rows in view are drawn
 function grow(){fInfo();if(!SRC||!FJ)return;var J=FJ,n=cnt(J);
  if(n!==SRC.n){SRC.n=n;rows.length=n;MISS=null}
  tail.textContent='';if(J.done&&!n&&!(J.g&&J.g.total==null))msg(tail,'ide.x.f.none');
  updWin(true)}
 function filterMod(w){var key='m|'+w+'|'+(MRG?1:0);
  if(!FJ||FJ.key!==key||FJ.tree!==TREE||FJ.gen!==TREE.gen){newJob({key:key,kind:'m',w:w,tree:TREE,gen:TREE.gen,i:0,hits:[],re:new RegExp(rxq(w),'i'),ctl:[],
   g:MRG?{total:null,ver:null,pages:{},asking:{},tries:0,gen:0}:null});fjStep(true);if(FJ.g)askG(FJ,0)}
  var J=FJ;
  function gAt(i){var gi=i-J.hits.length,pn=Math.floor(gi/FPG),p=J.g.pages[pn];return {pn:pn,p:p,f:p?p[gi-pn*FPG]:null}}
  SRC={n:cnt(J),
   at:function(i){if(i<J.hits.length){var f=J.tree.files[J.hits[i]];if(!f)return null;var it=fileItem(f,f.rel);it.hl=J.w;return it}
    if(!J.g)return null;var a=gAt(i);if(!a.p){askG(J,a.pn);return {kind:'wait',id:'w:'+i,name:'',title:''}}
    if(!a.f)return null;var gi=mgItem(a.f,'');gi.name='resource/'+a.f.name;gi.hl=J.w;return gi},
   name:function(i){if(i<J.hits.length){var f=J.tree.files[J.hits[i]];return f?f.rel:''}if(!J.g)return '';var a=gAt(i);return a.f?'resource/'+a.f.name:''},
   find:function(id){id=String(id);
    if(id.indexOf('m:')===0){var rel=id.slice(2),fs=J.tree.files,hs=J.hits;for(var i=0;i<hs.length;i++)if(fs[hs[i]].rel===rel)return i;return -1}
    if(/^w[:]\d+$/.test(id)){var x=+id.slice(2);return x<cnt(J)?x:-1}
    if(id.indexOf('mg:')!==0||!J.g)return -1;var k=id.slice(3);
    for(var pn in J.g.pages){var p=J.g.pages[pn];for(var j=0;j<p.length;j++)if(p[j].key===k)return J.hits.length+(+pn)*FPG+j}
    return -1}};
  fInfo();
  return FLAT}
 // (merged) one page of the game files not overwritten that hold the word (GET ide/vfind vanilla=1 under=1)
 function askG(J,pn){var G=J.g;if(!G||J.dead||G.pages[pn]||G.asking[pn])return;G.asking[pn]=true;var g0=G.gen;
  api('/api/x/ide/vfind?'+q({mod:curMod(),q:J.w,vanilla:'1',under:'1',off:pn*FPG,lim:FPG,ver:G.ver}),undefined,jobOpt(pn,'ide.job.vfind',{q:J.w})).then(function(r){
   if(J.dead||FJ!==J||J.g!==G||g0!==G.gen)return;r=r||{};delete G.asking[pn];
   if(G.ver&&r.ver!==G.ver){if(G.tries++<1){G.gen++;G.pages={};G.asking={};G.ver=null;G.total=null;askG(J,0);return}J.partial='changed'}
   if(!G.ver)G.ver=r.ver||null;
   var first=G.total==null;G.total=r.total||0;G.pages[pn]=r.hits||[];
   if(first||!J.done)grow();else{var a=J.hits.length+pn*FPG,b=Math.min(rows.length,a+FPG),ch=false;
    for(var i=a;i<b;i++){var e=rows[i];if(e&&e.it.kind==='wait'){e.gone=true;rows[i]=undefined;if(SELENT===e)SELENT=null;ch=true}}
    if(ch){MISS=null;updWin(true)}}},
  function(e){if(J.dead||FJ!==J||J.g!==G)return;delete G.asking[pn];
   if(G.total==null&&refused(e)){J.g=null;grow();return}
   G.err=errText(e);if(G.total==null)G.total=0;grow()})}
 // one slice of the look over my mod: about budget() ms, then the page is free again (the hits are row numbers of the list, no copy)
 function fjStep(quiet){var J=FJ;if(!J||J.dead||J.done||J.kind!=='m')return;var fs=J.tree.files,t=now(),b=budget();
  while(J.i<fs.length){var f=fs[J.i];if(f.state!=='pak'&&J.re.test(f.rel))J.hits.push(J.i);J.i++;if((J.i&511)===0&&now()-t>=b)break}
  if(J.i>=fs.length&&!J.tree.more){J.done=true;J.ms=now()-J.t0}
  else if(J.i<fs.length)later('fj',fjStep,0);
  if(quiet!==true)grow()}
 function filterGame(w){var key='g|'+w+'|'+(VAN?1:0)+'|'+curMod();
  if(!FJ||FJ.key!==key)askPage(newJob({key:key,kind:'g',w:w,total:null,ver:null,pages:{},asking:{},ctl:[],tries:0}),0);
  var J=FJ;
  SRC={n:J.total||0,
   at:function(i){var pn=Math.floor(i/FPG),p=J.pages[pn];if(!p){askPage(J,pn);return {kind:'wait',id:'w:'+i,name:'',title:''}}
    var f=p[i-pn*FPG];if(!f)return null;var it=gfileItem(f,'');it.name=f.name;it.hl=J.w;return it},
   name:function(i){var pn=Math.floor(i/FPG),p=J.pages[pn],f=p&&p[i-pn*FPG];return f?f.name:''},
   find:function(id){id=String(id);if(/^w[:]\d+$/.test(id)){var x=+id.slice(2);return x<(J.total||0)?x:-1}
    if(id.indexOf('g:')!==0)return -1;var k=id.slice(2);
    for(var pn in J.pages){var p=J.pages[pn];for(var j=0;j<p.length;j++)if(p[j].key===k)return (+pn)*FPG+j}
    return -1}};
  fInfo();
  return FLAT}
 // one page of the game search; pages are asked for when their rows come into view
 // J.gen counts the restarts: an answer to an ask sent before the last restart is dropped
 function askPage(J,pn){if(J.dead||J.pages[pn]||J.asking[pn])return;J.asking[pn]=true;var g=J.gen||0;
  var c=typeof AbortController==='function'?new AbortController():null;if(c)J.ctl.push(c);
  var jo=jobOpt(pn,'ide.job.vfind',{q:J.w});if(c)jo.signal=c.signal;
  api('/api/x/ide/vfind?'+q({mod:curMod(),q:J.w,vanilla:VAN?'1':null,off:pn*FPG,lim:FPG,ver:J.ver}),undefined,jo).then(function(r){
   if(J.dead||FJ!==J||g!==(J.gen||0))return;r=r||{};delete J.asking[pn];
   if(J.ver&&r.ver!==J.ver){
    // the game view was read again between two pages: start the list again once, then take what comes and say so
    if(J.tries++<1){J.gen=g+1;J.pages={};J.asking={};J.ver=null;J.total=null;J.done=false;J.again=true;askPage(J,0);return}
    J.partial='changed'}
   if(!J.ver)J.ver=r.ver||null;
   var first=J.total==null;J.total=r.total||0;J.pages[pn]=r.hits||[];
   if(first){J.done=true;J.ms=now()-J.t0}
   if(J.again){J.again=false;render();return}
   if(first)grow();else{refill(pn);if(J.partial)fInfo()}},
  function(e){if(J.dead||FJ!==J||g!==(J.gen||0))return;delete J.asking[pn];
   if(J.total==null&&refused(e)){VFALL=true;stopFJ();render();return}
   J.err=errText(e);if(J.total==null){J.total=0;J.done=true}grow()})}
 // a page came: its rows that were waiting are made again from it
 function refill(pn){if(!SRC)return;var a=pn*FPG,b=Math.min(rows.length,a+FPG),ch=false;
  for(var i=a;i<b;i++){var e=rows[i];if(e&&e.it.kind==='wait'){e.gone=true;rows[i]=undefined;if(SELENT===e)SELENT=null;ch=true}}
  if(ch){MISS=null;updWin(true)}}
 // no search on the server (an older one, or a phone session that may not use it): look in the folders already read
 function localGame(w){var items=[];
  if(!FJ||FJ.key!=='l|'+w)newJob({key:'l|'+w,kind:'l',w:w}).done=true;
  Object.keys(VD).sort(natCmp).forEach(function(p){var r=VD[p];(r&&r.files||[]).forEach(function(f){var it=gfileItem(f,p),label=pj(p,f.name);
   if(label.toLowerCase().indexOf(w)<0)return;it.name=label;it.hl=w;items.push(it)})});
  fInfo();
  if(!items.length){msg(body,'ide.x.f.none');return null}
  return items}

 function noGame(){msg(body,'ide.x.g.nogame');body.appendChild(h('button',{type:'button',class:'idx-btn',text:tx('ide.x.g.tomods'),onclick:function(){if(typeof show==='function')show('mods')}}))}
 function renderGame(){var w=word(),top=VD[''];
  if(w)return VFALL?localGame(w):filterGame(w);
  if(!top){loadDir('');top=VD['']}
  if(top.loading){msg(body,'ide.x.loading');return null}
  if(top.error){
   if(isNoGame(top.error))noGame();
   else{msg(body,'ide.x.err',{m:top.error},'idx-err');body.appendChild(h('button',{type:'button',class:'idx-btn',text:tx('ide.x.retry'),onclick:function(){delete VD[''];render()}}))}
   return null}
  // the route answers 200 with notes when it cannot build the game view
  if(hasNote(top,'no-game')){noGame();return null}
  if(hasNote(top,'vfs-failed')){msg(body,'ide.x.g.vfsfail',null,'idx-err');body.appendChild(h('button',{type:'button',class:'idx-btn',text:tx('ide.x.retry'),onclick:function(){delete VD[''];render()}}));return null}
  info.appendChild(h('span',{text:tx(VAN?'ide.x.g.vlead':'ide.x.g.lead')}));
  var vb=h('input',{type:'checkbox'});vb.checked=VAN;vb.addEventListener('change',function(){VAN=!!vb.checked;LS.set('ide.x.van',VAN);killLoads();VD={};stopFJ();render()});
  var vl=h('label',{class:'idx-van'},[vb,h('span',{text:' '+tx('ide.x.g.van')})]);IDE.tip(vl,'ide.x.g.van.tip');info.appendChild(document.createTextNode(' '));info.appendChild(vl);
  // a folder still arriving: its count here; an open folder whose list changed while it was read: Try again reads the open folders again
  info.appendChild(document.createTextNode(' '));GBZ=h('span',{class:'idx-busy'});info.appendChild(GBZ);gBusy();
  GWARN=Object.keys(VD).some(function(p){var r=VD[p];return !!r&&r.partial==='changed'&&(p===''||!!GOPEN[p])});
  if(GWARN)warn(tx('ide.x.part.changed'),true);
  var k=gameKids('');
  if(!k.length&&!top.more){msg(body,'ide.x.g.empty');return null}
  dirNote(top,function(key,p,cls){msg(tail,key,p,cls)});
  return k}
 function renderProblems(){var items=[];
  (IDE.docs||[]).forEach(function(d){var p=probOf(d);if(!p.e&&!p.w)return;
   items.push({kind:'file',name:d.name||baseOf(d.rel||d.key||d.path),id:'p:'+d.id,doc:d,p:p,ref:d.ref,rel:d.rel||null,key:d.key||null,ro:d.editable===false,title:d.rel||d.key||d.path||d.name})});
  if(!items.length){msg(body,'ide.x.p.none');return null}
  info.appendChild(h('span',{text:tx('ide.x.p.count',{n:items.length})}));
  return items}

 // ---------- selection, keyboard
 function cur(){if(SELENT&&!SELENT.gone&&rows[SELENT.ix]===SELENT&&SELENT.it.id===SEL)return SELENT;
  SELENT=null;
  if(SRC){if(!rows.length)return null;
   // the selected row of a filtered list is looked up once; a miss is kept until the list or the selection changes
   if(SEL!=null&&!(MISS&&MISS.s===SRC&&MISS.id===SEL&&MISS.n===rows.length)){var ix=SRC.find(SEL);
    if(ix>=0){var x=row(ix);if(x){SELENT=x;SEL=x.it.id;return x}}
    MISS={s:SRC,id:SEL,n:rows.length}}
   return row(0)}
  // the selected id is not among the rows (a deleted file, a closed folder): the miss is kept until the rows or the selection change,
  // so a scroll step does not walk every row again
  var f=null,miss=MISSF&&MISSF.id===SEL&&MISSF.rows===rows&&MISSF.n===rows.length;
  for(var i=0;i<rows.length;i++){var e=rows[i];if(!isNav(e))continue;if(!f){f=e;if(SEL==null||miss)return f}if(e.it.id===SEL){SELENT=e;return e}}
  if(SEL!=null)MISSF={id:SEL,rows:rows,n:rows.length};
  return f}
 function rove1(e,c){if(!isNav(e)||!e.el)return;var on=e===TABE,sel=!!c&&e===c&&e.it.id===SEL,sig=(on?'t':'')+(sel?'s':'');
  if(e.rv===sig)return;e.rv=sig;
  e.el.setAttribute('tabindex',on?'0':'-1');e.el.setAttribute('aria-selected',sel?'true':'false');
  e.el.className=e.el.className.replace(/\s*idx-sel\b/g,'')+(sel?' idx-sel':'')}
 function roving(){var c=cur(),t=mounted(c)?c:null,i;
  if(!t)for(i=0;i<MOUNT.length;i++)if(isNav(MOUNT[i])){t=MOUNT[i];break}
  TABE=t;for(i=0;i<MOUNT.length;i++)rove1(MOUNT[i],c)}
 function reveal(e){if(!e)return;
  if(rows.length<=WINAT){if(!mounted(e))updWin(true);return}
  var hh=viewH(),st=body.scrollTop||0,k=ratio(hh),V=st*k,top=e.ix*ROWH,nV=V;
  if(top<V)nV=top;else if(top+ROWH>V+hh)nV=top+ROWH-hh;
  var n=k===1?nV:nV/k;
  if(n!==st||!mounted(e)){body.scrollTop=n;var s2=body.scrollTop;updWin(false,typeof s2==='number'?s2:n);if(!mounted(e))updWin(true,typeof s2==='number'?s2:n)}}
 function focusSel(){var c=cur();if(!c)return false;reveal(c);if(mounted(c)){c.el.focus();return true}return false}
 function select(e){if(!isNav(e))return;SEL=e.it.id;SELENT=e;reveal(e);roving();if(mounted(e))e.el.focus()}
 function toggle(ent,v){var it=ent.it;if(it.lazy)GOPEN[it.path]=v;else OPEN[it.path]=v;saveOpen();SEL=it.id;SELENT=ent;
  var f=inside(document.activeElement,body);resub(ent);if(f)focusSel()}
 function openIt(it){if(it.doc){var p=it.p.first||{};return IDE.open(it.ref,p.line,p.col)}return IDE.open(it.ref)}
 function activate(ent){if(ent.it.kind==='wait')return;if(ent.it.kind==='dir')toggle(ent,!isOpen(ent.it,ent.depth));else openIt(ent.it)}
 function entOf(t){while(t&&t!==body){if(t.idxEnt)return t.idxEnt;t=t.parentNode}return null}
 // one click selects and acts: a folder opens or closes, a file opens in the editor (the twisty has its own handler)
 body.addEventListener('click',function(e){if(e&&e.button)return;var ent=entOf(e.target);if(!isNav(ent))return;select(ent);activate(ent)});
 body.addEventListener('dblclick',function(e){if(e&&e.preventDefault)e.preventDefault()});
 body.addEventListener('mousedown',function(e){if(e.button===1)e.preventDefault()});
 body.addEventListener('auxclick',function(e){if(e.button===1)e.preventDefault()});
 body.addEventListener('scroll',function(){if(rows.length>WINAT)updWin(false)});
 // one path for the menu: ContextMenu / Shift+F10 keydown and the native contextmenu event both land in menuReq;
 // the second request for the same row within 300 ms is dropped
 function menuReq(ent,x,y){if(ent.it.kind==='wait')return;var t=now(),id=ent.it.id;if(LASTM.id===id&&t-LASTM.t<300)return;LASTM={id:id,t:t};
  select(ent);if(x==null)menuAt(ent);else openMenu(ent,x,y)}
 body.addEventListener('contextmenu',function(e){var ent=entOf(e.target);if(!isNav(ent))return;e.preventDefault();
  var kb=!e.clientX&&!e.clientY;menuReq(ent,kb?null:e.clientX,kb?null:e.clientY)});
 body.addEventListener('keydown',function(e){if(DLG)return;var ent=entOf(e.target);if(!isNav(ent))ent=cur();if(!ent)return;
  if(ent.it.id!==SEL){SEL=ent.it.id;SELENT=ent;roving()}
  var i=ent.ix,k=e.key,it=ent.it,dir=it.kind==='dir',n=rows.length;
  function step(from,d){for(var j=from;j>=0&&j<n;j+=d){var r=row(j);if(isNav(r))return r}return null}
  function pg(){return Math.max(1,Math.floor(viewH()/ROWH)-1)}
  if(k==='ArrowDown')select(step(i+1,1));else if(k==='ArrowUp')select(step(i-1,-1));
  else if(k==='Home')select(step(0,1));else if(k==='End')select(step(n-1,-1));
  else if(k==='PageDown')select(step(Math.min(n-1,i+pg()),-1));else if(k==='PageUp')select(step(Math.max(0,i-pg()),1));
  else if(k==='ArrowRight'){if(dir){if(!isOpen(it,ent.depth))toggle(ent,true);else{var nx=row(i+1);if(nx&&nx.parent===ent)select(nx)}}}
  else if(k==='ArrowLeft'){if(dir&&isOpen(it,ent.depth))toggle(ent,false);else if(ent.parent)select(ent.parent)}
  else if(k==='Enter')activate(ent);
  else if(k==='ContextMenu'||(k==='F10'&&e.shiftKey))menuReq(ent,null,null);
  else if(k==='/'){if(filt.hidden)return;filt.focus();if(filt.select)filt.select()}
  else if(k&&k.length===1&&/\S/.test(k)&&!e.ctrlKey&&!e.altKey&&!e.metaKey){clearTimeout(TAT);TA+=k.toLowerCase();TAT=setTimeout(function(){TA=''},700);
   var s=TA.length===1?1:0;
   // a filtered list reads the names from its source, so no row is made for the ones passed over; its rows show paths, so the typed
   // letters match the start of the path or of the file name. A game search knows the names of the pages read so far only.
   for(var j=0;j<n;j++){var x=(i+s+j)%n,nm=SRC?SRC.name(x):(isNav(rows[x])?String(rows[x].it.name):'');if(!nm)continue;nm=nm.toLowerCase();
    if(nm.indexOf(TA)===0||(SRC&&nm.slice(nm.lastIndexOf('/')+1).indexOf(TA)===0)){select(row(x));break}}}
  else return;
  e.preventDefault();if(e.stopPropagation)e.stopPropagation()});
 // filter: an IME (ru, uk, zh) sends input events while composing; filter only on the finished text
 filt.addEventListener('compositionstart',function(){COMP=true});
 filt.addEventListener('compositionend',function(){COMP=false;later('filt',render,120)});
 filt.addEventListener('input',function(e){if(COMP||(e&&e.isComposing))return;later('filt',render,120)});
 filt.addEventListener('keydown',function(e){if(e._sk||COMP||e.isComposing||e.keyCode===229)return;
  if(e.key==='Escape'){if(filt.value){filt.value='';render()}else focusSel();e.preventDefault();if(e.stopPropagation)e.stopPropagation()}
  else if(e.key==='ArrowDown'||e.key==='Enter'){clearTimeout(tmr.filt);render();select(cur());e.preventDefault()}});
 function setMode(m){if(MODES.indexOf(m)<0)return;mode=m;LS.set('ide.x.mode',m);SEL=null;SELENT=null;render()}

 // ---------- actions
 function q(o){var s=[];for(var k in o)if(o[k]!=null)s.push(enc(k)+'='+enc(o[k]));return s.join('&')}
 function getIdx(key,cb){api('/api/x/files/which?'+q({mod:curMod(),key:key})).then(function(w){var rs=(w&&w.chain)||[];
  for(var i=0;i<rs.length;i++)if(rs[i].kind!=='deleted'&&rs[i].idx!=null){cb(rs[i].idx);return}
  toast(tx('ide.x.err.nolayer'))}).catch(fail)}
 function withRef(it,cb){var r=it.ref||{},o={mod:curMod()};
  if(it.rel){o.rel=it.rel;cb(o);return}
  if(r.path){o.path=r.path;cb(o);return}
  if(r.key&&r.idx!=null){o.key=r.key;o.idx=r.idx;cb(o);return}
  var key=r.key||it.key;if(!key){toast(tx('ide.x.err.nolayer'));return}
  getIdx(key,function(idx){o.key=key;o.idx=idx;cb(o)})}
 // the route throws (404 + message) when Notepad++ or Explorer cannot open it: show that message
 function extOpen(it,app){withRef(it,function(o){o.line=1;o.col=1;o.app=app;
  api('/api/x/ide/extopen',o).then(function(r){if(r&&r.pak){var f=String(r.file||'');toast(tx('ide.expPak',{p:f.slice(Math.max(f.lastIndexOf('/'),f.lastIndexOf('\\'))+1)}))}},function(e){toast(tx('ide.x.err.ext',{m:errText(e)}))})})}
 function closeDlg(refocus){if(!DLG)return;DLG=null;dlgBox.textContent='';dlgBox.hidden=true;if(refocus)focusSel()}
 // confirm card: target path inside the mod, size, new file or replace; yes() runs only on the button
 function ask(p,yes){closeDlg(false);
  var go=h('button',{type:'button',class:'idx-btn idx-primary',text:tx('ide.x.copy.do')}),no=h('button',{type:'button',class:'idx-btn',text:tx('ide.x.cancel')});
  var card=h('div',{class:'idx-dlg',role:'alertdialog','aria-label':tx('ide.x.copy.h')},[
   h('b',{text:tx('ide.x.copy.h')}),
   h('div',{class:'idx-dl',text:tx('ide.x.copy.to',{p:p.rel})}),
   h('div',{class:'idx-dl',text:tx('ide.x.copy.size',{n:sizeText(p.size)})}),
   h('div',{class:'idx-dl'+(p.exists?' idx-warn':''),text:tx(p.exists?'ide.x.copy.replace':'ide.x.copy.new')}),
   h('div',{class:'idx-dlrow'},[go,no])]);
  card.addEventListener('keydown',function(e){if(e.key==='Escape'){closeDlg(true);e.preventDefault();if(e.stopPropagation)e.stopPropagation()}});
  go.addEventListener('click',function(){if(!DLG)return;closeDlg(true);var r=yes();if(r&&typeof r.then==='function')r.then(null,fail)});
  no.addEventListener('click',function(){closeDlg(true)});
  DLG={p:p};dlgBox.appendChild(card);dlgBox.hidden=false;go.focus()}
 function copyIn(it){var key=it.key;if(!key)return;
  getIdx(key,function(idx){var b={mod:curMod(),key:key,idx:idx,rel:key};
   api('/api/x/files/copy',b).then(function(p){
    if(p.same){toast(tx('ide.x.copy.same'));IDE.open({rel:p.rel});return}
    ask(p,function(){var w={};for(var k in b)w[k]=b[k];w.write=true;
     return api('/api/x/files/copy',w).then(function(r){toast(tx('ide.x.copy.done',{p:r.rel}));IDE.emit('tree',{});IDE.open({rel:r.rel})})})}).catch(fail)})}
 function copyText(s){function done(){toast(tx('ide.x.copied',{p:s}))}
  function fb(){var ta=h('textarea',{class:'idx-clip','aria-hidden':'true'});ta.value=s;(document.body||root).appendChild(ta);
   try{ta.select();if(document.execCommand&&document.execCommand('copy'))done();else toast(tx('ide.x.copyfail'))}catch(e){toast(tx('ide.x.copyfail'))}
   if(ta.parentNode)ta.parentNode.removeChild(ta)}
  try{if(typeof navigator!=='undefined'&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(done,fb);return}}catch(e){}
  fb()}
 function walkDirs(it,fn){(it.kids||[]).forEach(function(k){if(k.kind==='dir'){fn(k);walkDirs(k,fn)}})}
 // open or close a folder and every folder under it; in the game view the folders already read open at once, the ones below them
 // are read as they open (a few at a time)
 function expandAll(ent,v){var it=ent.it;
  if(!it.lazy){OPEN[it.path]=v;walkDirs(it,function(k){OPEN[k.path]=v})}
  else{GOPEN[it.path]=v;var pre=it.path+'/';
   if(v){(function op(p){var r=VD[p];if(!r||!r.dirs)return;r.dirs.forEach(function(d){var cp=pj(p,d);GOPEN[cp]=true;op(cp)})})(it.path)}
   else Object.keys(GOPEN).forEach(function(k){if(k.indexOf(pre)===0)GOPEN[k]=false})}
  saveOpen();SEL=it.id;SELENT=ent;resub(ent);focusSel()}
 function menuItems(ent){var it=ent.it,L=[];
  // a phone (IDE.remote) reads only: no copy into the mod, no Explorer or Notepad++ on the PC
  function add(id,why,run){if(IDE.remote&&(id==='copyin'||id==='explorer'||id==='npp'))return;L.push({label:'ide.x.m.'+id,tip:'ide.x.m.'+id+'.tip',why:why?'ide.x.why.'+why:null,run:run})}
  if(it.kind==='dir'){
   add('expand',null,function(){expandAll(ent,true)});
   add('collapse',null,function(){expandAll(ent,false)});
   if(mode==='mod'){L.push('-');add('explorer',it.inner?'inpak':it.mg?'gamedir':null,function(){extOpen({rel:it.path},'explorer')});
    if(it.pak)add('hex',null,function(){IDE.open({mod:curMod(),rel:it.path},0,0,{view:'hex'})})}
   return L}
  var whyMine=!it.ro?'mine':!it.key?'nokey':null,vk=viewOf(it);
  add('open',null,function(){openIt(it)});
  // any file as bytes; a file that has a viewer also as text (the Editor shows it, read only when it is not text)
  if(vk!=='hex')add('hex',null,function(){IDE.open(it.ref,0,0,{view:'hex'})});
  if(vk)add('text',null,function(){IDE.open(it.ref,0,0,{view:false})});
  // the page that shows the file (ext view kinds model and map): a model's files on the Models page, a map folder's files on Maps
  var V=window.VIEW,fk=String(it.key||it.rel||it.name||'').toLowerCase(),inMap=V&&V.mapOf?V.mapOf(fk):null;
  if(V&&V.modelGo&&!IDE.remote&&!inMap){
   if(/\.(mdl|ply|vol|anm|mtl)$/.test(fk)||(/\.def$/.test(fk)&&fk.indexOf('entity/')>=0))add('models',null,function(){V.modelGo(it.ref,it.name)});
   else if(/\.(dds|tga)$/.test(fk))add('onmodel',null,function(){V.modelGo(it.ref,it.name)})}
  if(V&&V.mapGo&&!IDE.remote&&inMap)add('maps',null,function(){V.mapGo(it.ref,it.name)});
  add('compare',!it.key?'nokey':vk?'view':it.state==='new'?'novanilla':null,function(){after(openIt(it),function(){IDE.run('compare')})});
  add('copyin',whyMine,function(){copyIn(it)});
  L.push('-');
  add('which',(it.key||(it.rel&&!it.ro))?null:'nokey',function(){var r=it.key?{mod:curMod(),key:it.key}:{mod:curMod(),rel:it.rel};IDE.emit('which',{ref:r});IDE.panel('which')});
  add('usages',null,function(){IDE.emit('search',{q:baseOf(it.name).replace(/\.[^.]*$/,'')||baseOf(it.name)});IDE.panel('search')});
  L.push('-');
  add('copypath',it.rel?null:'notmine',function(){copyText(it.rel)});
  add('copykey',it.key?null:'nokey',function(){copyText(it.key)});
  L.push('-');
  add('explorer',null,function(){extOpen(it,'explorer')});
  add('npp',null,function(){extOpen(it,'npp')});
  return L}

 // ---------- context menu
 function openMenu(ent,x,y){closeMenu(false);menu.textContent='';var btns=[];
  menuItems(ent).filter(function(m,i,a){return m!=='-'||(i>0&&i<a.length-1&&a[i-1]!=='-')}).forEach(function(m){if(m==='-'){menu.appendChild(h('div',{class:'idx-sep',role:'separator'}));return}
   var b=h('button',{type:'button',role:'menuitem',class:'idx-mi',tabindex:'-1',text:tx(m.label),'aria-disabled':m.why?'true':null});
   IDE.tip(b,m.why||m.tip);
   b.addEventListener('click',function(e){if(e&&e.preventDefault)e.preventDefault();if(m.why)return;closeMenu(true);m.run()});
   b.idxItem=m;btns.push(b);menu.appendChild(b)});
  MENU={ent:ent,btns:btns};menu.hidden=false;place(x,y);
  var f=null;for(var i=0;i<btns.length;i++)if(!btns[i].idxItem.why){f=btns[i];break}
  (f||btns[0]).focus()}
 function place(x,y){var W=(typeof window!=='undefined'&&window.innerWidth)||1024,H=(typeof window!=='undefined'&&window.innerHeight)||768;
  var r=menu.getBoundingClientRect?menu.getBoundingClientRect():{width:200,height:240};
  x=Math.max(4,Math.min(x||0,W-(r.width||200)-4));y=Math.max(4,Math.min(y||0,H-(r.height||240)-4));
  menu.style.left=x+'px';menu.style.top=y+'px'}
 function menuAt(ent){var row=ent.el&&ent.el.firstChild,r=row&&row.getBoundingClientRect?row.getBoundingClientRect():null;
  openMenu(ent,r?r.left+16:16,r?r.bottom:16)}
 function closeMenu(refocus){if(!MENU)return;MENU=null;menu.hidden=true;menu.textContent='';if(refocus)focusSel()}
 menu.addEventListener('contextmenu',function(e){e.preventDefault()});
 menu.addEventListener('keydown',function(e){if(!MENU)return;var b=MENU.btns,i=b.indexOf(document.activeElement),k=e.key;
  if(k==='ArrowDown')b[(i+1)%b.length].focus();else if(k==='ArrowUp')b[(i+b.length-1)%b.length].focus();
  else if(k==='Home')b[0].focus();else if(k==='End')b[b.length-1].focus();
  else if(k==='Escape'||k==='Tab')closeMenu(true);
  else if(k==='Enter'||k===' '){if(i>=0)b[i].click()}
  else if(k==='ContextMenu'||(k==='F10'&&e.shiftKey)){}
  else return;
  e.preventDefault();if(e.stopPropagation)e.stopPropagation()});
 menu.addEventListener('focusout',function(){setTimeout(function(){if(MENU&&!inside(document.activeElement,menu))closeMenu(false)},0)});
 document.addEventListener('mousedown',function(e){if(MENU&&!inside(e.target,menu))closeMenu(false)});
 if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('blur',function(){closeMenu(false)});
 root.addEventListener('keydown',function(e){if(e.key==='/'&&e.target!==filt&&!filt.hidden&&!inside(e.target,body)&&!inside(e.target,dlgBox)){filt.focus();e.preventDefault()}});

 // ---------- IDE events
 function soon(){later('deco',function(){if(mode==='problems')render();else decorate()},60)}
 IDE.on('lint',function(d){if(d&&d.doc){FIND[d.doc.id]=d.findings||[];mcFromLint(d.doc)}soon()});
 // last "Check whole mod" answer: {mod?, files:[{rel|key|file, e, w}]} or {mod?, findings:[{rel|key|file, sev}]}
 IDE.on('modcheck',function(d){setMC(d);soon()});
 IDE.on('opened',soon);
 IDE.on('closed',function(d){if(d&&d.doc){delete FIND[d.doc.id];delete DIRTY[d.doc.id]}soon()});
 IDE.on('active',function(d){ACTIVE=(d&&d.doc)||null;later('act',decorate,30)});
 IDE.on('changed',function(d){if(d&&d.doc&&!DIRTY[d.doc.id]){DIRTY[d.doc.id]=true;later('act',decorate,30)}});
 IDE.on('saved',function(d){if(d&&d.doc)DIRTY[d.doc.id]=false;later('act',decorate,30)});
 IDE.on('tree',function(){TSTALE=true;later('reload',reload,250)});
 IDE.on('mod',function(){later('mod',render,150)});
 // a new height (full screen on or off, the window, a splitter, Arrange) changes how many rows are in view: the window of rows is
 // made again for it. Sources: the shell's layout event, the window's resize, a ResizeObserver on the list where there is one.
 var LASTH=-1;
 function sized(){var hh=viewH();if(hh===LASTH)return;LASTH=hh;if(rows.length>WINAT)updWin(true)}
 function sizedSoon(){later('size',sized,30)}
 IDE.on('layout',sizedSoon);
 if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('resize',sizedSoon);
 try{if(typeof window!=='undefined'&&typeof window.ResizeObserver==='function')new window.ResizeObserver(sizedSoon).observe(body)}catch(e){}

 function jobInfo(J){return {w:J.w,kind:J.kind,done:!!J.done,dead:!!J.dead,n:J.kind==='m'?J.hits.length:(J.total||0),scanned:J.i||0,ms:J.ms||0}}
 // lazy: built with the page while another page is on screen = nothing is drawn and the mod tree is not asked for; the Editor's first
 // show reads the mod (core.js refresh -> modChanged -> this part's refresh), which draws and starts the tree
 function offPage(){try{return typeof S!=='undefined'&&!!S&&!!S.sec&&!!S.sec.ide&&S.cur!=='ide'}catch(e){return false}}
 loadOpen();LASTMOD=modKey();if(!offPage())render();
 // the handle also rides on the root element (root.idxApi), so a test can reach a part the screen built at page load
 // (reveal) Show in the file list: o = {rel} (a file of the mod) or {key} (a game file: the merged "My mod" list when it is on, else
 // the Game view). The folders above it open, the filter is cleared, the row is selected as soon as it is drawn. false: nothing to show.
 function anc(p,out,pre){var s=String(p).split('::'),parts=s[0].split('/'),a='';
  for(var i=0;i<parts.length-(s.length>1?0:1);i++){a=a?a+'/'+parts[i]:parts[i];out[(pre||'')+a]=true}
  if(s.length>1){var inn=s[1].split('/');a=s[0]+'::';for(i=0;i<inn.length-1;i++){a=a+(i?'/':'')+inn[i];out[a]=true}}}
 function show(o){o=o||{};if(!curMod())return false;var rel=o.rel,key=o.key,id=null,m='mod';
  if(rel){anc(rel,OPEN);id='m:'+rel}
  else if(key&&MRG){anc(key,OPEN);id='mg:'+key}
  else if(key){var g=String(key).replace(/^resource\//i,'');var go={};anc(g,go);for(var k in go)GOPEN[k]=true;id='g:'+key;m='game'}
  else return false;
  saveOpen();if(filt.value)filt.value='';if(mode!==m){mode=m;LS.set('ide.x.mode',m)}
  PEND=id;SEL=id;SELENT=null;render();trySel();return true}
 function trySel(){if(!PEND)return;for(var i=0;i<rows.length;i++){var e=rows[i];if(e&&e.it.id===PEND){PEND=null;select(e);return}}}
 return (root.idxApi={refresh:function(){render()},show:show,focus:function(){if(!focusSel()){if(!filt.hidden){if(fKit)fKit.focus();else filt.focus()}else tabs[mode].focus()}},
  // read only, for Go to file (core.js): the mod's whole file list when it is read whole, for this mod, and not about to be read again
  // (no tree event since it was read); else null
  files:function(m){return TREE&&TREEMOD===m&&m===curMod()&&!TREELOAD&&!TSTALE&&!TREE.more&&!TREE.partial&&!TREE.truncated&&TREE.files?TREE.files:null},
  // read only, for tests: what the list holds and what the filter is doing
  state:function(){var hh=viewH();return {mode:mode,rows:rows.length,mounted:MOUNT.length,flat:!!SRC,sel:SEL,loads:LRUN+LQ.length,
   tree:TREE?{files:(TREE.files||[]).length,more:!!TREE.more,partial:TREE.partial||null,unread:TREE.unread||0}:null,
   filter:FJ?jobInfo(FJ):null,jobs:JL.map(jobInfo),
   geo:{a:WIN.a,b:WIN.b,top:WIN.top,scaled:ratio(hh)!==1,height:ratio(hh)===1?rows.length*ROWH:LIMPX,view:hh}}}});
};
})();
`,
css: [
// (merged) a game file or folder in the "My mod" list: dimmed
'.idx-game>.idx-row{opacity:.62}',
'.idx{display:flex;flex-direction:column;height:100%;min-width:0;min-height:0;font-size:13px;color:var(--fg);background:transparent}',
// a narrow explorer wraps its mode tabs to a second line instead of cutting their names
'.idx-tabs{display:flex;flex-wrap:wrap;gap:2px;padding:4px 4px 0;border-bottom:1px solid var(--line)}',
'.idx-tab{flex:1 1 auto;min-width:min-content;font:inherit;font-size:12px;padding:3px 4px;border:1px solid transparent;border-bottom:0;background:transparent;border-radius:4px 4px 0 0;cursor:pointer;color:var(--hint);white-space:nowrap}',
'.idx-tab[aria-selected=true]{background:var(--in);border-color:var(--line);font-weight:600;margin-bottom:-1px;color:var(--fg)}',
'.idx-tab:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}',
'.idx-frow{display:flex;align-items:center;gap:4px;padding-right:4px}','.idx-frow .idx-filter{flex:1}','.idx-frow .idx-btn{margin-top:4px}',
'.idx-filter{margin:6px 4px 2px;padding:3px 6px;font:inherit;font-size:12px;min-width:0;box-sizing:border-box;border:1px solid var(--inl);border-radius:3px;background:var(--in);color:var(--fg)}',
'.idx-filter[hidden]{display:none}',
'.idx-frow>.idx-sk{display:flex;flex:1;min-width:0;margin:6px 4px 2px}','.idx-frow>.idx-sk>.idx-filter{margin:0;flex:1 1 auto}','.idx-sk[hidden]{display:none}',
// the info line never shrinks under the list (a narrow column wraps its parts onto lines of their own, nothing drawn on top of the rows)
'.idx-info{padding:2px 6px;font-size:11px;color:var(--hint);min-height:14px;flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:baseline;column-gap:6px;row-gap:2px;min-width:0;overflow-wrap:anywhere;word-break:break-word}',
'.idx-info>*{max-width:100%;min-width:0}',
'.idx-mgbox{display:flex;align-items:flex-start;gap:2px;flex:1 1 100%}',
'.idx-mgbox>input{flex:0 0 auto;margin:1px 2px 0 0}',
'.idx-warn{color:var(--iw)}',
'.idx-err{color:var(--err)}',
'.idx-busy{font-style:italic}',
'.idx-mini{margin:0 0 0 6px;padding:0 6px;font-size:11px}',
// overflow-anchor: the spacers change height while the list scrolls; the browser must not move the scroll position for that
'.idx-body{flex:1 1 auto;overflow:auto;min-height:0;padding:2px 0 8px;overflow-anchor:none}',
'.idx-body:focus{outline:none}',
'.idx-sp{height:0;flex:none}',
'.idx-item{outline:none;height:20px;box-sizing:border-box;overflow:hidden}',
'.idx-row{display:flex;align-items:center;gap:4px;height:20px;box-sizing:border-box;padding:1px 4px;white-space:nowrap;cursor:default;border-radius:3px;min-width:0;line-height:18px}',
'.idx-row:hover{background:var(--hov)}',
'.idx-sel>.idx-row{background:var(--sel)}',
'.idx-item:focus>.idx-row{box-shadow:inset 0 0 0 1px var(--acc)}',
'.idx-imsg{font-size:12px;line-height:20px;color:var(--hint);white-space:nowrap;text-overflow:ellipsis;padding-right:8px}',
'.idx-wait{font-style:italic}',
'.idx-wait.idx-sel{background:var(--sel)}',
'.idx-wait:focus{box-shadow:inset 0 0 0 1px var(--acc)}',
'.idx-tw{flex:0 0 12px;width:12px;text-align:center;color:var(--hint);font-size:10px;cursor:pointer}',
'.idx-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}',
'.idx-active>.idx-row .idx-name{font-weight:700}',
'.idx-ro>.idx-row .idx-name{color:var(--hint)}',
'.idx-hit{background:var(--whol);color:inherit;padding:0}',
'.idx-deco{display:flex;gap:3px;flex:0 0 auto}',
'.idx-dot{display:inline-block;width:7px;height:7px;border-radius:50%}',
'.idx-dirty{background:var(--fg)}',
'.idx-dot-e{background:var(--err)}',
'.idx-dot-w{background:var(--iw)}',
'.idx-dot-c{box-sizing:border-box;background:transparent;border:2px solid currentColor}',
'.idx-dot-c.idx-dot-e{color:var(--err)}.idx-dot-c.idx-dot-w{color:var(--iw)}',
'.idx-tag{flex:0 0 auto;font-size:10px;line-height:14px;padding:0 5px;border-radius:7px;background:var(--chip);color:var(--fg);max-width:8em;overflow:hidden;text-overflow:ellipsis}',
'.idx-b-override{background:var(--qp);box-shadow:inset 3px 0 var(--acc)}.idx-b-new{background:var(--chip);box-shadow:inset 3px 0 var(--ok)}.idx-b-loses{background:var(--hbox);box-shadow:inset 3px 0 var(--err)}',
'.idx-b-modinfo{background:var(--chip);box-shadow:inset 3px 0 var(--ok)}.idx-b-unmounted,.idx-b-mounted{background:var(--chip)}.idx-b-pak,.idx-b-inpak,.idx-t-pak{background:var(--who);box-shadow:inset 3px 0 var(--whol)}',
'.idx-w-mine{background:var(--chip);box-shadow:inset 3px 0 var(--ok)}.idx-w-othermod{background:var(--ban);box-shadow:inset 3px 0 var(--banl)}.idx-w-vanilla{background:var(--chip)}',
'.idx-t-e{background:var(--hbox);color:var(--err)}.idx-t-w{background:var(--who);color:var(--fg);box-shadow:inset 3px 0 var(--iw)}',
'.idx-msg{padding:4px 8px;font-size:12px;color:var(--hint);white-space:normal}',
'.idx-btn{margin:2px 8px;font:inherit;font-size:12px}',
'.idx-dlgbox[hidden]{display:none}',
'.idx-dlg{margin:4px;padding:6px 8px;border:1px solid var(--line);border-radius:4px;background:var(--card);color:var(--fg);font-size:12px;display:flex;flex-direction:column;gap:3px}',
'.idx-dl{word-break:break-all}',
'.idx-dlrow{display:flex;gap:6px;margin-top:4px}',
'.idx-dlrow .idx-btn{margin:0}',
'.idx-primary{font-weight:600}',
'.idx-menu{position:fixed;z-index:1000;min-width:180px;max-width:280px;background:var(--card);border:1px solid var(--line);border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.18);padding:3px 0;font-size:12px;color:var(--fg)}',
'.idx-menu[hidden]{display:none}',
'.idx-mi{display:block;width:100%;box-sizing:border-box;text-align:left;border:0;background:transparent;padding:4px 12px;cursor:pointer;color:var(--fg);font:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.idx-mi:hover,.idx-mi:focus{background:var(--sel);outline:none}',
'.idx-mi[aria-disabled=true]{color:var(--hint);opacity:.7;cursor:default}',
'.idx-sep{height:1px;background:var(--line2);margin:3px 0}',
'.idx-clip{position:fixed;left:-9999px;top:0;opacity:0}'
].concat(DEPTH_CSS).join('\n')
};
