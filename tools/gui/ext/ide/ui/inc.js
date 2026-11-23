// ARSENAL Editor, part inc: inline include windows. On an `(include "path")` line the file it brings in opens in a window right under
// that line, inside the text (an editor line widget holding an editor of its own: IDE_ED inline + a second IDE_ED.create). The host
// text, its line numbers, findings, search and save stay as they are: a line widget adds no text.
// Open and close: the arrow in the include gutter, Alt+I on the line, the link in the include hover, the Jump menu and Ctrl+K
// (incToggle, incAll, incNone, incEnter). The path is found by the server the way the game finds it (POST /api/x/ide/inc: intel
// incLocate, relative to the including file, then this mod, other mods and the game's paks). A loose file of this mod is editable
// in place and is one buffer with its tab (ED.linkDoc; a window edited before its file has a tab makes the tab: IDE.adopt), so save,
// undo, the dirty dot and the check are the tab's. Game files, paks, other mods and big files shown in pages are read only.
// Nested windows open the same way inside a window (depth cap MAXD, include cycles refused with a message). Windows open on a file
// are remembered for the page session and come back when its tab is opened again.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent; every word through tx().
// Contract: tools/ide/README.md "Inline include windows". Author: Imperator_Aug (ARSENAL, inline include windows)
// Author: Imperator_Aug (ARSENAL, ia-2ad3868b)
'use strict';
const script = String.raw`
(function(){
if(typeof IDE==='undefined'||!IDE||!IDE.parts||IDE.remote)return;
var MAXD=4,MAXALL=30,DEFH=240,MINH=80,MAXH=900,STEP=120,NW=0,MAXGUT=3000,MAXDEF=200;
var ROOTS={},REM={},RESTORED={},LASTW=null;
// keys reached through a computed name
var INC_KEYS=['ide.inc.ro.big','ide.inc.ro.pak','ide.inc.ro.other','ide.inc.ro.game','ide.inc.w.mine','ide.inc.w.minePak','ide.inc.w.other',
 'ide.inc.w.game','ide.inc.w.gamePak','ide.inc.missing','ide.inc.special','ide.inc.cycle','ide.inc.deep','ide.inc.fail'];
function low(s){return String(s||'').replace(/\\/g,'/').toLowerCase()}
function qs(o){var s=[];Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=='')s.push(encodeURIComponent(k)+'='+encodeURIComponent(o[k]))});return s.join('&')}
function MAIN(){return IDE.ed?IDE.ed():null}
function hNow(){var v=+LS.get('ide.inc.h',DEFH);return isFinite(v)&&v>=MINH&&v<=MAXH?Math.round(v):DEFH}
function refFields(r){var b={};['mod','rel','key','idx','path'].forEach(function(k){if(r&&r[k]!=null)b[k]=r[k]});return b}
function refKey(r){return low(r.mod)+'|'+(r.rel!=null?'r:'+low(r.rel):r.key?'k:'+r.key+'#'+r.idx:'p:'+low(r.path))}
// the code part of a line: up to a ; outside quotes
function codePart(s){var q=false;for(var i=0;i<s.length;i++){var c=s.charAt(i);if(c==='"')q=!q;else if(c===';'&&!q)return s.slice(0,i)}return s}
// every (include "path" ...) of a text: [{line, col, value}] (the reader takes the word include in any case)
function incsOf(text){var out=[],ls=String(text||'').split('\n');
 for(var i=0;i<ls.length&&out.length<MAXGUT;i++){var l=ls[i];if(l.toLowerCase().indexOf('include')<0)continue;
  var c=codePart(l),re=/\(\s*include\s+"([^"]*)"/ig,m;while((m=re.exec(c)))out.push({line:i+1,col:m.index+1,value:m[1]})}return out}
// every (define "name" ...) of a text: [{name, line, col}]
function defsOf(text){var out=[],ls=String(text||'').split('\n');
 for(var i=0;i<ls.length&&out.length<MAXDEF;i++){var l=ls[i];if(l.toLowerCase().indexOf('define')<0)continue;
  var c=codePart(l),re=/\(\s*define\s+"([^"]+)"/ig,m;while((m=re.exec(c))&&out.length<MAXDEF)out.push({name:m[1],line:i+1,col:m.index+1})}return out}

// ---------------------------------------------------------------- hosts: a tab's doc, or a window (for nested windows)
// H = { main, d?, w?, ed, id (doc id in ed), depth, chain:[keys open above], kids:[W], base (route ref of the tab), from (key) }
function hostOfDoc(d){var k=low(d.key||d.ref.key||'');return {main:true,d:d,ed:MAIN(),id:d.id,depth:0,chain:k?[k]:[],kids:ROOTS[d.id]||(ROOTS[d.id]=[]),base:refFields(d.ref),from:null}}
function hostOfWin(W){return {main:false,w:W,ed:W.ed,id:W.wid,depth:W.depth,chain:W.chain.concat([low(W.key)]),kids:W.kids,base:W.base,from:W.key}}
function hostText(H){if(H.main)return IDE.textOf(H.d);var t=H.ed?H.ed.text(H.id):'';return t==null?'':t}
function shownHost(H){if(H.main){var ed=MAIN();return !!ed&&IDE.active()===H.d&&(!ed.current||ed.current()===H.id)}return !!H.w.ed&&!H.w.dead}
function incAt(H,line){var all=incsOf(hostText(H));for(var i=0;i<all.length;i++)if(all[i].line===line)return all[i];return null}
function lineOf(W){var n=W.handle?W.handle.line():null;return n==null?null:n}
function findWin(H,line){for(var i=0;i<H.kids.length;i++)if(lineOf(H.kids[i])===line)return H.kids[i];return null}
function allWins(){var out=[];function walk(l){l.forEach(function(w){out.push(w);walk(w.kids)})}Object.keys(ROOTS).forEach(function(k){walk(ROOTS[k])});return out}

// the arrows in the include gutter, open lines marked
function gutter(H){if(!H.ed||!H.ed.incGutter||!shownHost(H))return;
 var list=incsOf(hostText(H)).map(function(x){var o=!!findWin(H,x.line);return {line:x.line,open:o,title:tx(o?'ide.inc.gutClose':'ide.inc.gutOpen',{p:x.value})}});
 try{H.ed.incGutter(list,function(line){toggle(H,line,false)})}catch(e){}}
function remember(H){if(!H.main)return;REM[refKey(H.d.ref)]=H.kids.map(function(w){return {line:lineOf(w)||w.line0,value:w.value}})}

// ---------------------------------------------------------------- open, close
function toggle(H,line,focus){var w=findWin(H,line);if(w){closeWin(w,true);IDE.status(tx('ide.inc.closed'));return null}
 var inc=incAt(H,line);if(!inc){IDE.status(tx('ide.inc.noInc'));return null}
 return openWin(H,line,inc,{focus:focus})}
function sayWhere(res){if(res.where==='mine')return res.inPak?tx('ide.inc.w.minePak',{p:res.inPak}):tx('ide.inc.w.mine');
 if(res.where==='othermod')return tx('ide.inc.w.other',{m:res.layer||''});return res.inPak?tx('ide.inc.w.gamePak',{p:res.inPak}):tx('ide.inc.w.game')}
function roOf(res){if(!res.whole)return 'big';if(res.where==='mine')return res.inPak?'pak':null;return res.where==='othermod'?'other':'game'}
function setH(W,v){v=Math.max(MINH,Math.min(MAXH,Math.round(v)));W.h=v;W.body.style.height=v+'px';LS.set('ide.inc.h',v);
 W.rz.setAttribute('aria-valuenow',String(v));if(W.ed&&W.ed.refresh)try{W.ed.refresh()}catch(e){}if(W.handle)W.handle.changed()}
function hbtn(text,label,fn,cls){var b=h('button',{type:'button',class:'ide-incbtn'+(cls?' '+cls:''),text:text,'aria-label':label,onclick:function(e){if(e&&e.preventDefault)e.preventDefault();fn()}});
 if(IDE.tip)try{b.title=label}catch(e){}return b}
function build(W){
 W.path=h('span',{class:'ide-incp',text:W.value});W.where=h('span',{class:'ide-incwh'});W.ro=h('span',{class:'ide-incro',hidden:true,text:tx('ide.inc.roBadge')});
 W.count=h('span',{class:'ide-incn'});W.msg=h('div',{class:'ide-incmsg',role:'status',hidden:true});
 W.defb=h('button',{type:'button',class:'ide-incbtn ide-incdefb',hidden:true,'aria-expanded':'false',onclick:function(){var on=W.defl.hidden;W.defl.hidden=!on;W.defb.setAttribute('aria-expanded',on?'true':'false');if(W.handle)W.handle.changed()}});
 W.defl=h('div',{class:'ide-incd',role:'group','aria-label':tx('ide.inc.defsH'),hidden:true});
 W.more=hbtn(tx('ide.inc.more'),tx('ide.inc.moreT'),function(){more(W)});W.more.hidden=true;
 W.tabb=hbtn(tx('ide.inc.tab'),tx('ide.inc.tabT'),function(){LASTW=W;if(W.res&&W.res.ref)IDE.open(Object.assign({mod:W.base.mod},W.res.ref))});W.tabb.hidden=true;
 var grow=hbtn('+',tx('ide.inc.grow'),function(){setH(W,W.h+STEP)}),shrink=hbtn('−',tx('ide.inc.shrink'),function(){setH(W,W.h-STEP)});
 var close=hbtn('×',tx('ide.inc.close'),function(){var H=W.host;closeWin(W,true);if(H&&H.ed){try{H.ed.focus()}catch(e){}}},'ide-incx');
 W.head=h('div',{class:'ide-inch'},[h('span',{class:'ide-incarrow','aria-hidden':'true',text:'▾'}),W.path,W.where,W.ro,W.count,W.defb,W.more,
  h('span',{class:'ide-incgrow'}),W.tabb,shrink,grow,close]);
 W.body=h('div',{class:'ide-incb'});W.body.style.height=W.h+'px';
 W.rz=h('div',{class:'ide-incr',role:'separator','aria-orientation':'horizontal',tabindex:'0','aria-label':tx('ide.inc.resize'),'aria-valuemin':String(MINH),'aria-valuemax':String(MAXH),'aria-valuenow':String(W.h)});
 W.rz.addEventListener('keydown',function(e){if(e.key==='ArrowUp'||e.key==='ArrowDown'){if(e.preventDefault)e.preventDefault();setH(W,W.h+(e.key==='ArrowDown'?20:-20))}});
 W.rz.addEventListener('mousedown',function(e){if(e.button!==0)return;if(e.preventDefault)e.preventDefault();var y0=e.clientY,h0=W.h;
  function mv(ev){setH(W,h0+(ev.clientY-y0))}function up(){document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up)}
  document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up)});
 W.node=h('div',{class:'ide-incw',role:'region','aria-label':tx('ide.inc.region',{p:W.value})},[W.head,W.msg,W.defl,W.body,W.rz]);
 // the window last used (a click, a focus inside it): a jump made from it starts from its include line (IDE.incOrigin, the trail)
 W.node.addEventListener('mousedown',function(){LASTW=W});W.node.addEventListener('focusin',function(){LASTW=W});
 W.node.addEventListener('keydown',function(e){if((e.key==='Escape'||e.key==='Esc')&&!e.defaultPrevented&&e.target&&e.target.tagName==='BUTTON'){if(e.preventDefault)e.preventDefault();back(W)}})}
function openWin(H,line,inc,o){o=o||{};if(!shownHost(H))return null;var ed=H.ed;if(!ed||typeof ed.inline!=='function'){IDE.status(tx('ide.inc.noEd'));return null}
 var W={id:'w'+(++NW),wid:'inc'+NW,host:H,depth:H.depth+1,value:inc.value,kids:[],h:hNow(),base:H.base,from:H.from,chain:H.chain.slice(),line0:line,key:null,res:null,ed:null,doc:null,o:null,dead:false};
 build(W);
 W.handle=ed.inline(line,W.node,{});if(!W.handle)return null;
 H.kids.push(W);remember(H);gutter(H);
 if(W.depth>MAXD){msg(W,'ide.inc.deep',{n:MAXD});return W}
 load(W,o);return W}
function msg(W,k,p){W.msg.hidden=false;W.msg.textContent=tx(k,p);W.body.hidden=true;W.rz.hidden=true;W.state='msg';W.msgKey=k;if(W.handle)W.handle.changed();IDE.status(W.msg.textContent)}
function load(W,o){W.state='loading';W.count.textContent=tx('ide.inc.loading');
 var b=refFields(W.base);b.value=W.value;if(W.from)b.from=W.from;
 // the server has one thread: the first check of a mod (the game file index) holds every answer behind it. Said after 2 s.
 setTimeout(function(){if(!W.dead&&W.state==='loading'){W.count.textContent=tx('ide.inc.waitSrv');W.msg.hidden=false;W.msg.textContent=tx('ide.inc.waitSrvT')}},2000);
 return IDE.call('/api/x/ide/inc',b).then(function(res){if(W.dead)return;W.res=res;if(W.msgKey==null&&W.msg.textContent===tx('ide.inc.waitSrvT')){W.msg.hidden=true;W.msg.textContent=''}W.key=res.key||null;
  W.path.textContent=res.key||W.value;W.count.textContent='';
  if(res.special)return msg(W,'ide.inc.special',{p:res.value});
  if(!res.found)return msg(W,'ide.inc.missing',{p:(res.tried&&res.tried.length?res.tried:[res.key]).join(', ')});
  if(W.chain.indexOf(low(res.key))>=0)return msg(W,'ide.inc.cycle',{p:res.key});
  W.ref=Object.assign({mod:W.base.mod},res.ref||{});W.kind=IDE.kindOf?IDE.kindOf(res.key):'sdl';
  if(res.editable&&res.whole&&res.ref&&res.ref.rel!=null)
   return IDE.call('/api/x/files/open?'+qs({mod:W.base.mod,rel:res.ref.rel})).then(function(f){if(!W.dead)mount(W,res,f,o)});
  mount(W,res,null,o)})
 .catch(function(e){if(!W.dead)msg(W,'ide.inc.fail',{m:e.message})})}
function mount(W,res,f,o){var E=window.IDE_ED;if(!E||!E.create){msg(W,'ide.inc.fail',{m:'IDE_ED'});return}
 W.where.textContent=sayWhere(res);var ro=f&&f.editable!==false?null:roOf(res);
 W.ro.hidden=!ro;if(ro){W.ro.title=tx('ide.inc.ro.'+ro);W.ro.setAttribute('aria-label',tx('ide.inc.roBadge')+': '+tx('ide.inc.ro.'+ro))}
 W.tabb.hidden=!res.ref;W.state='shown';
 try{W.ed=E.create(W.body,IDE.edOpts?IDE.edOpts(tx('ide.inc.edLabel',{p:res.key})):{label:res.key})}catch(e){msg(W,'ide.inc.fail',{m:e.message});return}
 var tab=f?IDE.byRef({mod:W.base.mod,rel:res.ref.rel},false):null,ed=MAIN();
 if(tab&&!tab.view&&ed&&W.ed.linkDoc&&W.ed.linkDoc(W.wid,{ed:ed,id:tab.id},tab.kind,!tab.editable))W.doc=tab;
 else W.ed.addDoc(W.wid,f?f.text:res.text,W.kind,!f||f.editable===false);
 W.o=f;W.ed.swap(W.wid);
 W.ed.on('change',function(){winChanged(W)});
 W.ed.on('save',function(){if(W.doc)IDE.saveDoc(W.doc);else IDE.status(tx(W.o?'ide.noChange':'ide.inc.roSave'))});
 if(W.ed.hoverProvider)W.ed.hoverProvider(winHover(W));
 W.ed.keys({'Esc':function(){back(W)},'Alt-I':function(){var c=W.ed.cursor();toggle(hostOfWin(W),c.line,true)},
  'Shift-Alt-I':function(){openAll(hostOfWin(W))},'Alt-Down':function(){enter(hostOfWin(W),W.ed.cursor().line)}});
 if(W.doc&&IDE.fresh(W.doc))W.ed.marks(W.doc.findings||[]);else if(f&&!W.doc)lintWin(W);
 more0(W);defsDraw(W);count(W);gutter(hostOfWin(W));
 if(W.handle)W.handle.changed();
 if(o&&o.focus)W.ed.focus()}
function count(W){var n=W.ed?W.ed.lineCount():0;W.count.textContent=W.res&&W.res.next!=null?tx('ide.inc.linesPart',{n:n,kb:Math.round((W.res.size||0)/1024)}):tx('ide.inc.lines',{n:n})}
function more0(W){W.more.hidden=!(W.res&&W.res.next!=null)}
// the next page of a big file (read only): appended
function more(W){if(!W.res||W.res.next==null||!W.ed)return;var b=refFields(W.base);b.value=W.value;if(W.from)b.from=W.from;b.off=W.res.next;
 IDE.call('/api/x/ide/inc',b).then(function(r){if(W.dead||!W.ed)return;W.ed.setText(W.wid,(W.ed.text(W.wid)||'')+(r.text||''));W.res.next=r.next;more0(W);count(W);defsDraw(W);gutter(hostOfWin(W))})
 .catch(function(e){IDE.status(IDE.errMsg(e,'ide.inc.fail'))})}
function lintWin(W){if(!W.o||!W.ed||IDE.remote)return;var k=W.kind;if(k!=='sdl'&&k!=='lng')return;var t=W.ed.text(W.wid),b=refFields(W.ref);b.text=t;
 IDE.call('/api/x/ide/lint',b).then(function(r){if(W.dead||!W.ed||W.doc||W.ed.text(W.wid)!==t)return;W.ed.marks(r.findings||[])}).catch(function(){})}
function winChanged(W){if(W.dead||!W.ed)return;
 if(W.doc){if(IDE.docs.indexOf(W.doc)>=0)IDE.edChange({id:W.doc.id})}
 else if(W.o&&W.o.editable!==false&&W.res&&W.res.editable){var d=IDE.adopt({mod:W.base.mod,rel:W.res.ref.rel},W.o,{ed:W.ed,id:W.wid});
  if(d){W.doc=d;IDE.edChange({id:d.id});IDE.status(tx('ide.inc.adopted',{p:d.name}))}}
 defsDraw(W);count(W);prune(hostOfWin(W));gutter(hostOfWin(W))}
function defsDraw(W){var t=W.ed?W.ed.text(W.wid):'',ds=defsOf(t);W.defs=ds;W.defl.textContent='';
 W.defb.hidden=!ds.length;W.defb.textContent=tx('ide.inc.defs',{n:ds.length});
 ds.forEach(function(x){W.defl.appendChild(h('button',{type:'button',class:'ide-incdef',text:x.name,'aria-label':tx('ide.inc.defGo',{p:x.name,n:x.line}),onclick:function(){if(!W.ed)return;W.ed.goto(x.line,x.col);W.ed.focus()}}))});
 if(!ds.length)W.defl.hidden=true}
function winHover(W){return function(req,done){
 if(req.mark){done({title:req.mark.code||'',lead:req.mark.msg||'',rows:[],links:[]});return}
 if(!W.ref||!(W.kind==='sdl'||W.kind==='lng')){done(null);return}
 var b=refFields(W.ref);b.line=req.line;b.col=req.col;
 var clean=W.doc?!IDE.isDirty(W.doc):W.ed.isClean(W.wid);if(!clean)b.text=W.ed.text(W.wid);
 IDE.call('/api/x/ide/hover',b).then(function(r){var v=r&&r.hover;if(!v||W.dead)return done(null);var c=IDE.navCard(v),ln=req.line;
  if(v.what==='include')c.links.unshift({text:tx('ide.inc.showHere'),run:function(){toggle(hostOfWin(W),ln,true)}});done(c)}).catch(function(){done(null)})}}
// Esc in a window: back to the host's include line
function back(W){var H=W.host,ln=lineOf(W)||W.line0;if(!H||!H.ed)return;try{H.ed.goto(ln,1);H.ed.focus()}catch(e){}}
// focus the window on this line, else the next one below
function enter(H,line){var best=null;H.kids.forEach(function(w){var l=lineOf(w);if(l!=null&&l>=line&&(!best||l<lineOf(best)))best=w});
 if(!best){IDE.status(tx('ide.inc.none'));return}if(best.ed)best.ed.focus();else if(best.node&&best.node.focus){best.node.setAttribute('tabindex','-1');best.node.focus()}}
function kill(W){if(W.dead)return;W.dead=true;W.kids.slice().forEach(kill);W.kids=[];
 if(W.ed){try{if(W.ed.dropDoc)W.ed.dropDoc(W.wid)}catch(e){}try{W.ed.destroy()}catch(e){}W.ed=null}}
function closeWin(W,rem){var H=W.host;kill(W);if(W.handle)W.handle.clear();var i=H.kids.indexOf(W);if(i>=0)H.kids.splice(i,1);if(rem)remember(H);gutter(H)}
// windows whose include line is gone (deleted text) go too
function prune(H){H.kids.slice().forEach(function(w){if(lineOf(w)==null)closeWin(w,true)})}
function openAll(H){if(!shownHost(H))return 0;var all=incsOf(hostText(H)),n=0,seen={};
 for(var i=0;i<all.length&&n<MAXALL;i++){var x=all[i];if(seen[x.line]||findWin(H,x.line))continue;seen[x.line]=1;if(openWin(H,x.line,x,{}))n++}
 var left=all.filter(function(x){return !findWin(H,x.line)}).length;
 IDE.status(left?tx('ide.inc.allCapped',{n:n,m:MAXALL}):tx('ide.inc.allDone',{n:n}));return n}
function closeAll(H){var n=H.kids.length;H.kids.slice().forEach(function(w){closeWin(w,false)});remember(H);gutter(H);IDE.status(tx('ide.inc.noneDone',{n:n}));return n}
// a window whose file tab closed (edits kept or thrown away there): read again from disk, the window stays where it is
function reload(W){W.kids.slice().forEach(kill);W.kids=[];if(W.ed){try{W.ed.dropDoc(W.wid)}catch(e){}try{W.ed.destroy()}catch(e){}W.ed=null}
 W.doc=null;W.o=null;W.body.textContent='';W.body.hidden=false;W.rz.hidden=false;W.msg.hidden=true;load(W,{})}

// ---------------------------------------------------------------- shell events
function activeHost(){var d=IDE.active();return d&&!d.view?hostOfDoc(d):null}
IDE.on('active',function(x){var d=x&&x.doc;if(!d||d.view)return;var H=hostOfDoc(d);
 // windows drawn while their tab was hidden measure again now that they are in the page
 (function walk(l){l.forEach(function(w){if(w.ed&&w.ed.refresh)try{w.ed.refresh()}catch(e){}walk(w.kids)})})(H.kids);
 if(!RESTORED[d.id]){RESTORED[d.id]=1;var list=REM[refKey(d.ref)]||[];
  list.forEach(function(r){var inc=incAt(H,r.line);if(!inc||inc.value!==r.value){var all=incsOf(hostText(H));inc=null;for(var i=0;i<all.length;i++)if(all[i].value===r.value&&!findWin(H,all[i].line)){inc=all[i];break}}
   if(inc&&!findWin(H,inc.line))openWin(H,inc.line,inc,{})})}
 gutter(H)});
IDE.on('changed',function(x){var d=x&&x.doc;if(!d||IDE.active()!==d)return;var H=hostOfDoc(d);prune(H);gutter(H)});
IDE.on('lint',function(x){allWins().forEach(function(w){if(w.doc===x.doc&&w.ed&&IDE.fresh(x.doc))w.ed.marks(x.findings||[])})});
IDE.on('closed',function(x){var d=x&&x.doc;if(!d)return;
 if(ROOTS[d.id]){ROOTS[d.id].slice().forEach(kill);delete ROOTS[d.id]}delete RESTORED[d.id];
 allWins().forEach(function(w){if(w.doc===d&&!w.dead)reload(w)})});
IDE.on('mod',function(){Object.keys(ROOTS).forEach(function(k){ROOTS[k].slice().forEach(kill)});ROOTS={};REM={};RESTORED={}});
function canInc(){var d=IDE.active();return !!d&&!d.view&&(d.kind==='sdl'||d.kind==='lng')&&!!MAIN()}
// (trail) the place a jump leaves when it starts from a window: the include line of its top window in the active tab, not the
// host's cursor (which a gutter click does not move). A move of the host's cursor ends it.
IDE.incOrigin=function(){var W=LASTW;if(!W||W.dead)return null;while(W.host&&!W.host.main)W=W.host.w;
 var d=IDE.active();if(!W||!W.host||!W.host.d||!d||W.host.d!==d)return null;var l=lineOf(W);return l==null?null:{line:l,col:1}};
IDE.on('cursor',function(){LASTW=null});
IDE.incToggle=function(line){var H=activeHost();if(!H)return null;return toggle(H,line||MAIN().cursor().line,true)};
IDE.inc={hosts:function(){return ROOTS},all:allWins,remembered:function(){return REM},incsOf:incsOf,defsOf:defsOf,
 open:function(line){var H=activeHost();if(!H)return null;var inc=incAt(H,line);return inc&&!findWin(H,line)?openWin(H,line,inc,{}):findWin(H,line)},
 close:function(line){var H=activeHost(),w=H?findWin(H,line):null;if(w)closeWin(w,true);return !!w},nested:function(W,line){var H=hostOfWin(W),inc=incAt(H,line);return inc?openWin(H,line,inc,{}):null},
 back:back,MAXD:MAXD};
IDE.action('incToggle',{label:'ide.a.incToggle',tip:'ide.a.incToggleT',key:'Alt+I',group:'jump',run:function(){IDE.incToggle(MAIN().cursor().line)},when:canInc});
IDE.action('incAll',{label:'ide.a.incAll',tip:'ide.a.incAllT',key:'Shift+Alt+I',group:'jump',run:function(){var H=activeHost();if(H)openAll(H)},when:canInc});
IDE.action('incNone',{label:'ide.a.incNone',tip:'ide.a.incNoneT',key:null,group:'jump',run:function(){var H=activeHost();if(H)closeAll(H)},when:function(){var H=activeHost();return !!H&&H.kids.length>0}});
IDE.action('incEnter',{label:'ide.a.incEnter',tip:'ide.a.incEnterT',key:'Alt+Down',group:'jump',bar:false,run:function(){var H=activeHost();if(H)enter(H,MAIN().cursor().line)},when:function(){var H=activeHost();return !!H&&H.kids.length>0}});
})();
`;

const css = [
  '.CodeMirror.ide-cm .ide-incg{width:14px}',
  '.ide-incm{display:inline-block;width:14px;text-align:center;cursor:pointer;color:var(--mut,#888);font-size:10px}',
  '.ide-incm:hover,.ide-incm-on{color:var(--ac,#4a8)}',
  '.ide-incw{margin:2px 0 4px 0;border:1px solid var(--br,#555);border-left:3px solid var(--ac,#4a8);background:var(--in,#1e1e1e);border-radius:3px;font-family:inherit;white-space:normal}',
  '.ide-inch{display:flex;align-items:center;gap:6px;padding:2px 6px;font-size:12px;background:var(--th,#2a2a2a);color:var(--fg,#ddd);border-bottom:1px solid var(--br,#555);flex-wrap:wrap}',
  '.ide-incp{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:45%}',
  '.ide-incwh,.ide-incn{opacity:.8}',
  '.ide-incro{border:1px solid currentColor;border-radius:3px;padding:0 4px;font-size:11px}',
  '.ide-incgrow{flex:1 1 auto}',
  '.ide-incbtn{font-size:11px;padding:0 6px;min-width:22px;cursor:pointer}',
  '.ide-incmsg{padding:3px 8px;font-size:12px;color:var(--warn,#d9a400)}',
  '.ide-incd{display:flex;flex-wrap:wrap;gap:4px;padding:3px 6px;max-height:84px;overflow:auto;border-bottom:1px solid var(--br,#555)}',
  '.ide-incdef{font-size:11px;padding:0 5px;cursor:pointer;font-family:monospace}',
  '.ide-incb{position:relative;min-height:60px}',
  '.ide-incb>.CodeMirror{position:absolute;top:0;left:0;right:0;bottom:0;height:auto}',
  '.ide-incr{height:6px;cursor:ns-resize;background:var(--br,#555);opacity:.5}',
  '.ide-incr:hover,.ide-incr:focus{opacity:1;outline:none}',
].join('\n');

module.exports = { script, css };
