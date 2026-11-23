// Editor bottom panel: problems, search, which file wins, usages, game log, restore points, Notepad++ setup.
// Browser script (ES5, page rules: no backtick, no dollar-brace, DOM only through h() and textContent). Contract: tools/ide/README.md.
// Every request carries a ticket (sequence number + mod): an answer that no longer matches is dropped.
// Author: Imperator_Aug (ARSENAL, ia-cb059332)
module.exports = {
  script: String.raw`
(function(){
if(typeof IDE==='undefined'||!IDE||!IDE.parts)return;
IDE.parts.panels=function(host){
 var TABS=['problems','search','which','usages','log','restore','npp'];
 // a phone (IDE.remote) reads only: search and which file wins. Problems and usages need the PC's index, the log is in the user
 // folder, restore points and Notepad++ write
 if(IDE.remote)TABS=['search','which'];
 var CAP=500,FB='/api/x/files/',IB='/api/x/ide/';
 var ICON={error:String.fromCharCode(0x2716),warn:String.fromCharCode(0x26a0),info:String.fromCharCode(0x2139)};
 var cur=LS.get('ide.p.tab',TABS[0]);if(TABS.indexOf(cur)<0)cur=TABS[0];
 var st={lint:null,errOnly:!!LS.get('ide.p.errOnly',false),sr:null,srq:null,whichRef:null,whichQ:'',which:null,refs:null,refsMod:'',
  log:null,logBusy:false,logAuto:false,logTimer:null,logSel:-1,undo:null,undoMod:'',thisOnly:null,npp:null,plan:null,explain:{}};
 var SEQ={};

 function T(k,p){return tx('ide.p.'+k,p)}
 function tOr(k,fb,p){var s=T(k,p);return s==='ide.p.'+k?fb:s}
 function tip(el,k){if(IDE.tip)IDE.tip(el,'ide.p.'+k);else el.setAttribute('title',T(k));return el}
 function btn(k,fn,o){o=o||{};var b=h('button',{type:'button',class:o.primary?'primary':null,text:o.text||T(k,o.p),onclick:fn});tip(b,k+'T');return b}
 function hint(t){return h('div',{class:'hint idp-hint',text:t})}
 function note(t){return h('div',{class:'idp-note',text:t})}
 // m: the message, or the error itself; a request stopped from the job list (e.cancelled) is a plain line, not an error
 function errBox(m){if(m&&typeof m==='object'){if(m.cancelled)return h('div',{class:'hint idp-hint',role:'status',text:m.message||''});m=m.message}
  return h('div',{class:'err idp-err',role:'alert',text:T('error',{m:m})})}
 function loading(box){box.textContent='';box.appendChild(h('div',{class:'hint idp-hint',role:'status',text:T('loading')}))}
 function qs(o){var s=[];Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=='')s.push(encodeURIComponent(k)+'='+encodeURIComponent(o[k]))});return s.join('&')}
 function stop(e){if(e&&e.stopPropagation)e.stopPropagation()}
 function nrel(p){return String(p||'').replace(/\\/g,'/').replace(/^\/+/,'').toLowerCase()}
 function active(){return IDE.active?IDE.active():null}
 function chk(k,on,fn){var c=h('input',{type:'checkbox'});c.checked=!!on;c.addEventListener('change',function(){fn(c.checked)});var l=h('label',{class:'idp-chk'},[c,' '+T(k)]);tip(l,k+'T');return {box:l,input:c}}
 function capList(arr,box,fn){arr.slice(0,CAP).forEach(fn);if(arr.length>CAP)box.appendChild(note(T('capped',{n:CAP,all:arr.length})))}
 function noGame(e){return typeof NOGAME!=='undefined'&&(NOGAME.test(e.message)||e.message===tx('game.notSet'))}
 function lang(){return typeof LANG!=='undefined'?LANG:'en'}
 // Enter that is not the end of an IME composition (ru/zh input methods send Enter to pick a word)
 function isEnter(e){return e.key==='Enter'&&!e.isComposing&&e.keyCode!==229}
 // a key a searchKit took (e._sk: it picked a row of its list) is not this box's Enter; set after the kit
 function onEnter(inp,fn){inp.addEventListener('keydown',function(e){if(e._sk)return;if(isEnter(e)){e.preventDefault();fn()}})}
 // ticket: sequence number + mod for one request kind; ok() is false once a newer request, a cancel or a mod switch happened
 function ticket(tag,anyMod){var n=(SEQ[tag]||0)+1,m=S.mod;SEQ[tag]=n;return function(){return SEQ[tag]===n&&(anyMod||S.mod===m)}}
 function drop(tag){SEQ[tag]=(SEQ[tag]||0)+1}
 function diffBox(hunks){var pre=h('pre',{class:'idp-diff'});
  (hunks||[]).forEach(function(k){pre.appendChild(h('span',{class:'idp-dh',text:'@@ '+T('line',{n:k.oldLine})+'\n'}));
   (k.del||[]).forEach(function(t){pre.appendChild(h('span',{class:'idp-del',text:'- '+t+'\n'}))});
   (k.add||[]).forEach(function(t){pre.appendChild(h('span',{class:'idp-add',text:'+ '+t+'\n'}))})});
  return pre}

 // ---------------- frame: tab row (stays put) + scrolling body
 host.textContent='';
 var root=h('div',{class:'idp'}),bar=h('div',{class:'idp-tabs',role:'tablist','aria-label':T('tabs')}),body=h('div',{class:'idp-body',role:'tabpanel',tabindex:'-1'});
 root.appendChild(bar);root.appendChild(body);host.appendChild(root);
 var tabs={},badges={},panes={};
 TABS.forEach(function(id){var bd=h('span',{class:'idp-badge',hidden:true});
  var b=h('button',{type:'button',role:'tab',id:'idp-tab-'+id,class:'idp-tab','aria-selected':'false',tabindex:'-1',onclick:function(){showTab(id)},onkeydown:tabKey},[h('span',{text:T('tab.'+id)}),bd]);
  tip(b,'tab.'+id+'T');tabs[id]=b;badges[id]=bd;bar.appendChild(b)});
 function tabKey(e){var i=TABS.indexOf(cur),n=-1;
  if(e.key==='ArrowRight')n=(i+1)%TABS.length;else if(e.key==='ArrowLeft')n=(i+TABS.length-1)%TABS.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=TABS.length-1;
  if(n<0)return;e.preventDefault();showTab(TABS[n]);tabs[TABS[n]].focus()}
 function badge(id,n){var b=badges[id];if(!b)return;b.textContent=n?String(n>999?'999+':n):'';b.hidden=!n}
 function showTab(id){if(TABS.indexOf(id)<0)return;cur=id;LS.set('ide.p.tab',id);
  TABS.forEach(function(t){tabs[t].setAttribute('aria-selected',t===id?'true':'false');tabs[t].setAttribute('tabindex',t===id?'0':'-1');tabs[t].className='idp-tab'+(t===id?' idp-on':'')});
  body.setAttribute('aria-labelledby','idp-tab-'+id);
  var p=pane(id);body.textContent='';body.appendChild(p.el);p.draw()}
 function pane(id){if(!panes[id])panes[id]=({problems:mkProblems,search:mkSearch,which:mkWhich,usages:mkUsages,log:mkLog,restore:mkRestore,npp:mkNpp})[id]();return panes[id]}
 function redraw(id){if(cur===id)pane(id).draw()}

 // ---------------- 1. problems
 function mkProblems(){var head=h('div',{class:'idp-head'}),list=h('div',{class:'idp-list',role:'list'}),el=h('div',{},[head,list]);
  function draw(){head.textContent='';list.textContent='';var d=active();
   // (jump) whole-mod problem stepping (ui/jump.js): previous/next problem and kind, the filter, where you are
   if(typeof IDE.jumpBar==='function')try{head.appendChild(IDE.jumpBar())}catch(e){}
   if(!d){badge('problems',0);list.appendChild(hint(T('pr.nodoc')));return}
   var lt=st.lint&&st.lint.doc===d?st.lint:null;
   var fs=(lt&&lt.findings)||d.findings||[],fx=(lt&&lt.fixes)||d.fixes||[],multi=(lt&&lt.multi)||d.multi||[];
   var n={error:0,warn:0,info:0};fs.forEach(function(f){n[f.sev in n?f.sev:'info']++});
   badge('problems',fs.length);
   head.appendChild(h('span',{class:'idp-counts',text:T('pr.counts',{e:n.error,w:n.warn,i:n.info})}));
   head.appendChild(chk('pr.errOnly',st.errOnly,function(v){st.errOnly=v;LS.set('ide.p.errOnly',v);draw()}).box);
   var safe=fx.filter(function(f){return f.safe});
   if(safe.length)head.appendChild(btn('pr.fixAll',function(){fixAll(d,safe)},{p:{n:safe.length}}));
   if(multi.length){head.appendChild(h('span',{class:'idp-note',text:T('pr.multi')}));head.appendChild(btn('pr.patch',function(){if(IDE.goPage)IDE.goPage('check');else show('check')}))}
   if(!fs.length){list.appendChild(hint(T('pr.none')));return}
   var rows=fs.filter(function(f){return !st.errOnly||f.sev==='error'});
   if(!rows.length){list.appendChild(hint(T('pr.noErr')));return}
   capList(rows,list,function(f){list.appendChild(probRow(d,f,fx))})}
  return {el:el,draw:draw}}
 function fixFor(f,fx){for(var i=0;i<fx.length;i++)if(fx[i].code===f.code&&fx[i].line===f.line)return fx[i];return null}
 function moveRow(row,dir){var all=row.parentNode&&row.parentNode.parentNode?row.parentNode.parentNode.querySelectorAll('div.idp-go'):[],i=-1;
  for(var k=0;k<all.length;k++)if(all[k]===row)i=k;var t=all[i+dir];if(t)t.focus()}
 function rowKeys(row,go){row.addEventListener('keydown',function(e){if(e.target!==row)return;
  if(isEnter(e)){e.preventDefault();go()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();moveRow(row,e.key==='ArrowDown'?1:-1)}})}
 function probRow(d,f,fx){var sev=ICON[f.sev]?f.sev:'info',fix=fixFor(f,fx),xb=h('div',{class:'idp-explain',hidden:true});
  var row=h('div',{class:'idp-row idp-go idp-'+sev,role:'listitem',tabindex:'0','data-line':String(f.line)},[
   h('span',{class:'idp-sev',title:T('sev.'+sev),'aria-label':T('sev.'+sev),text:ICON[sev]}),
   h('span',{class:'idp-pos',text:f.line+':'+f.col}),
   h('span',{class:'idp-msg',text:f.msg||''}),
   h('span',{class:'idp-code',text:f.code||''})]);
  function go(){IDE.open(d.ref,f.line,f.col)}
  row.addEventListener('click',go);rowKeys(row,go);
  var acts=h('span',{class:'idp-acts'});
  if(fix)acts.appendChild(btn('pr.fix',function(e){stop(e);applyFix(d,fix)},{text:T('pr.fixL',{l:fix.label?tx(fix.label.k,fix.label.p):fix.code})}));
  if(f.code)acts.appendChild(btn('pr.explain',function(e){stop(e);explain(f.code,xb)}));
  row.appendChild(acts);
  return h('div',{class:'idp-item'},[row,xb])}
 // the shell applies exactly this fix as one undo step (not the one under the cursor)
 function applyFix(d,fix){IDE.emit('fix',{doc:d,fix:fix})}
 function fixAll(d,safe){if(IDE.actions&&IDE.actions.fixAll)IDE.run('fixAll');else IDE.emit('fix',{doc:d,fixes:safe})}
 function explain(code,box){if(!box.hidden){box.hidden=true;return}box.hidden=false;
  if(st.explain[code]){drawExplain(box,code,st.explain[code]);return}
  loading(box);
  api('/api/explain?codes='+encodeURIComponent(code)+'&lang='+encodeURIComponent(lang())).then(function(j){var c=j.cards&&j.cards[code];
   if(c)st.explain[code]=c;drawExplain(box,code,c)}).catch(function(e){box.textContent='';box.appendChild(errBox(e))})}
 function drawExplain(box,code,c){box.textContent='';
  if(!c){box.appendChild(hint(T('ex.none',{c:code})));return}
  box.appendChild(h('div',{},[h('b',{text:T('ex.what')+' '}),h('span',{text:c.what||code})]));
  if(c.why)box.appendChild(h('div',{},[h('b',{text:T('ex.why')+' '}),h('span',{text:c.why})]));
  if(c.impact)box.appendChild(hint(c.impact));
  if(c.fix&&c.fix.length){box.appendChild(h('b',{text:T('ex.fix')}));box.appendChild(h('ol',{},c.fix.map(function(s){return h('li',{text:s})})))}
  box.appendChild(hint(c.auto?T(c.safe?'ex.autoSafe':'ex.autoRisky',{fixer:c.auto}):T('ex.manual')))}

 // ---------------- 2. search in files
 function mkSearch(){
  // SPEED: the server starts reading the mod's text files into memory now (files/corpus.js), so the first search finds them there
  if(S.mod)api(FB+'warm',{mod:S.mod}).catch(function(){});
  var q=h('input',{type:'text',class:'idp-q','aria-label':T('s.q'),placeholder:T('s.q'),value:LS.get('ide.p.s.q','')});
  function opt(k,lsk){return chk(k,LS.get(lsk,false),function(v){LS.set(lsk,v)})}
  var rx=opt('s.regex','ide.p.s.rx'),cs=opt('s.case','ide.p.s.cs'),va=opt('s.vanilla','ide.p.s.va');
  var other=h('input',{type:'text',class:'idp-path','aria-label':T('s.other'),placeholder:T('s.other'),value:LS.get('ide.p.s.other','')});
  function keepOther(){LS.set('ide.p.s.other',other.value.trim())}
  other.addEventListener('change',keepOther);
  var SID='idp-'+String(Math.random()).slice(2,12)+'-'+(+new Date());
  var goB=btn('s.go',run,{primary:true}),stopB=btn('s.cancel',cancel),res=h('div',{class:'idp-list'});stopB.hidden=true;
  // a phone searches the mod and the game only: no other folder (the folder picker stays on the PC)
  if(IDE.remote)other.value='';
  // searchKit (page.js; owner 2026-11-19: browse, indexed search and history on every search box). The text: history 'ide.search',
  // index = the words of the open file and the game words of its kind (IDE.words, kept once made), Browse = the file picker on the game
  // data (the mod on top) at the open file's folder: the picked file's name is searched for (where the mod names that file); a pick
  // searches at once. The other folder: history 'ide.search.other', index = the folders picked lately in the folder popup, Browse =
  // the folder picker (disk) at that folder, else the mod.
  function wHits(s,W){s=String(s).toLowerCase();var pre=[],sub=[],n=0;
   function put(x,hint){var i=x.lo.indexOf(s);if(i<0)return;n++;var it={label:x.w,value:x.w,hint:hint};if(i===0){if(pre.length<30)pre.push(it)}else if(sub.length<30)sub.push(it)}
   W.file.forEach(function(x){put(x,T('s.wFile',{n:x.n}))});W.game.forEach(function(x){put(x,x.hint||T('s.wGame'))});
   var out=pre.concat(sub).slice(0,30);return {a:out,more:n-out.length}}
  var qKit=IDE.kitOn?IDE.kitOn(q,{key:'ide.search',
   index:function(s,done){if(!IDE.words){done([]);return}IDE.words(function(W){var r=wHits(s,W);done(r.a,r.more)})},
   browse:{mode:'file',view:'data',start:function(){var d=active(),k=d&&(d.key||(d.ref&&d.ref.key))||'',r=d&&d.ref&&d.ref.rel||'';
     var p=String(k||r).replace(/\\/g,'/').replace(/^resource\//i,'');return p.slice(0,Math.max(0,p.lastIndexOf('/')))},
    toValue:function(p,e){return (e&&e.name)||String(p).split('/').pop()}},
   onPick:function(v){q.value=v;run()}}):null;
  function setOther(p){other.value=p;LS.set('ide.p.s.other',p)}
  var oKit=IDE.remote||!IDE.kitOn?null:IDE.kitOn(other,{key:'ide.search.other',
   index:function(s,done){s=String(s).toLowerCase();var a=(typeof recGet==='function'?recGet('dir'):[]).filter(function(p){return String(p).toLowerCase().indexOf(s)>=0});
    done(a.slice(0,30).map(function(p){return {label:p,value:p,hint:T('s.recentDir')}}),Math.max(0,a.length-30))},
   browse:{mode:'dir',start:function(){return other.value.trim()||S.mod||''}},
   onPick:function(v){setOther(v)}});
  var el=h('div',{},[h('div',{class:'idp-head'},[qKit?qKit.el:q,goB,stopB,rx.box,cs.box,va.box]),
   IDE.remote?null:h('div',{class:'idp-head'},[h('span',{class:'hint',text:T('s.other')}),oKit?oKit.el:other,
    oKit?null:btn('s.pick',function(){pick('dir',other.value||S.mod,function(p){setOther(p)})}),
    btn('s.clear',function(){other.value='';LS.set('ide.p.s.other','')})]),res]);
  onEnter(q,run);onEnter(other,function(){keepOther();run()});
  function busy(on){goB.disabled=!!on;stopB.hidden=!on}
  function run(){if(!S.mod){res.textContent='';res.appendChild(hint(T('noMod')));return}
   if(!q.value.trim()){res.textContent='';res.appendChild(hint(T('s.empty')));return}
   LS.set('ide.p.s.q',q.value);loading(res);busy(true);
   var sq={q:q.value,regex:rx.input.checked,cs:cs.input.checked},ok=ticket('search'),m=S.mod;
   // sid: a newer search with the same sid makes the server stop the older one, which answers {cancelled:true}
   api(FB+'search',{mod:m,q:q.value,regex:sq.regex,caseSens:sq.cs,vanilla:va.input.checked,other:other.value.trim(),sid:SID})
   .then(function(r){if(!ok()||!r||r.cancelled)return;busy(false);r.mod0=m;st.sr=r;st.srq=sq;badge('search',(r.hits||[]).length);draw()})
   .catch(function(e){if(!ok())return;busy(false);res.textContent='';res.appendChild(errBox(e))})}
  // the request cannot be stopped on the server; its answer is ignored when it comes
  function cancel(){drop('search');busy(false);res.textContent='';res.appendChild(hint(T('s.cancelled')))}
  function gid(x){return x.file?'f|'+x.file:'k|'+x.key}
  function game(x){return !x.file&&!!x.key}
  function draw(){var r=st.sr;if(!r||r.mod0!==S.mod){res.textContent='';res.appendChild(hint(T('s.lead')));return}
   res.textContent='';var groups={},order=[],hits=r.hits||[];
   hits.forEach(function(x){var g=gid(x);if(!groups[g]){groups[g]=[];order.push(g)}groups[g].push(x)});
   res.appendChild(h('div',{class:'idp-counts',role:'status',text:T('s.found',{n:hits.length,f:order.length,ms:r.ms==null?'?':r.ms})}));
   var sn=r.searched!=null?r.searched:null,timeUp=r.partial&&r.why==='time';
   if(sn!=null)res.appendChild(hint(T('s.searched',{n:sn})));
   if(r.asOf)res.appendChild(hint(T('s.asof')));
   if(timeUp)res.appendChild(note(T('s.stopTime')));
   else if(r.truncated&&r.truncated!==true)res.appendChild(note(tOr('s.cut.'+r.truncated,T('s.cut'),{n:hits.length})));
   else if(r.partial||r.truncated)res.appendChild(note(T('s.partial0')));
   if(!hits.length){res.appendChild(hint(T('s.none')));return}
   var shown=0;
   order.forEach(function(g0){if(shown>=CAP)return;var g=groups[g0],x0=g[0];
    var where=game(x0)?T(x0.pak?'s.layerPak':'s.layer',{l:x0.layer==null?'?':x0.layer,p:x0.pak||''}):tOr('s.root.'+x0.root,String(x0.root||''));
    res.appendChild(h('div',{class:'idp-file',title:x0.file||x0.key||''},[h('b',{text:x0.rel||x0.key||x0.file||''}),h('span',{class:'idp-dim',text:' '+where+' ('+g.length+')'})]));
    g.forEach(function(x){if(shown>=CAP)return;shown++;
     var row=h('div',{class:'idp-row idp-go',tabindex:'0'},[h('span',{class:'idp-pos',text:String(x.line)}),h('span',{class:'idp-text'},marked(x.text||'',st.srq))]);
     // game hits (pak entries included) open read only from the game index layer; files on disk keep the path form
     function go(){if(game(x))IDE.open({key:x.key,idx:x.idx},x.line,x.col);else IDE.open({path:x.file},x.line,x.col)}
     row.addEventListener('click',go);rowKeys(row,go);res.appendChild(row)})});
   if(hits.length>CAP)res.appendChild(note(T('capped',{n:CAP,all:hits.length})))}
  return {el:el,draw:draw,run:function(text){q.value=text;run()},focus:function(){q.focus()}}}
 function marked(text,sq){var out=[],re;
  try{re=new RegExp(sq.regex?sq.q:sq.q.replace(/[.*+?^$()|[\]\\{}]/g,'\\$&'),sq.cs?'g':'gi')}catch(e){return [text]}
  var last=0,m,guard=0;
  while((m=re.exec(text))&&guard++<200){if(!m[0].length){re.lastIndex++;continue}
   if(m.index>last)out.push(text.slice(last,m.index));out.push(h('mark',{class:'idp-hit',text:m[0]}));last=m.index+m[0].length}
  if(last<text.length)out.push(text.slice(last));return out}

 // ---------------- 3. which file wins
 function mkWhich(){var box=h('div',{class:'idp-list'}),dlg=h('div'),el=h('div',{},[dlg,box]);
  function query(){var r=st.whichRef,d=active();
   if(r){if(r.key)return {mod:S.mod,key:r.key};if(r.rel)return {mod:S.mod,rel:r.rel};return null}
   if(!d)return undefined;if(d.key)return {mod:S.mod,key:d.key};if(d.rel)return {mod:S.mod,rel:d.rel};return null}
  function draw(force){var q=query();
   if(!S.mod){box.textContent='';box.appendChild(hint(T('noMod')));return}
   if(q===undefined){box.textContent='';dlg.textContent='';box.appendChild(hint(T('w.nodoc')));return}
   if(q===null){box.textContent='';dlg.textContent='';box.appendChild(hint(T('w.notGame')));return}
   var key=JSON.stringify(q);if(!force&&st.which&&st.whichQ===key){view(st.which);return}
   st.whichQ=key;dlg.textContent='';loading(box);var ok=ticket('which');
   api(FB+'which?'+qs(q)).then(function(w){if(!ok()||st.whichQ!==key)return;st.which=w;view(w)})
   .catch(function(e){if(!ok())return;box.textContent='';box.appendChild(errBox(e))})}
  function view(w){box.textContent='';
   (w.notes||[]).forEach(function(n){var k='files.n.'+String(n).replace(/-/g,''),s=tx(k,{m:w.error||''});box.appendChild(hint(s===k?n:s))});
   // GT-03: mod.info is read by the game; its own note above says so, the "never reads" line is not added
   if(!w.mounted){if((w.notes||[]).indexOf('modinfo')<0)box.appendChild(hint(T('w.notGame')));return}
   var ch=w.chain||[];
   if(!ch.length){box.appendChild(hint(T('w.none',{k:w.key})));return}
   var top=ch[0];
   box.appendChild(h('p',{class:'idp-lead',text:top.winner?T('w.lead',{who:whose(top),where:whereOf(top)})+(ch.length>1?' '+T('w.leadMore',{n:ch.length-1}):''):T('w.leadDel',{k:w.key})}));
   box.appendChild(hint(T('w.key',{k:w.key})));
   var mine=null;ch.forEach(function(r){if(!mine&&r.kind==='mine'&&r.source==='loose'&&!r.how)mine=r});
   var tb=h('table',{class:'idp-table'},[h('tr',{},[h('th',{text:T('w.c.state')}),h('th',{text:T('w.c.whose')}),h('th',{text:T('w.c.where')}),h('th',{text:''})])]);
   box.appendChild(tb);
   capList(ch,box,function(r,i){var acts=h('td',{class:'idp-acts'});
    if(r.kind!=='deleted'){
     if(r===mine)acts.appendChild(btn('w.edit',function(){IDE.open({rel:relInMod(r)})}));
     acts.appendChild(btn('w.view',function(){IDE.open({key:w.key,idx:r.idx})}));
     if(r.kind!=='mine'&&!IDE.remote)acts.appendChild(btn('w.copy',function(){copyFlow({key:w.key,idx:r.idx},String(w.key||''))}));
     // one request only: the shell's compare handler opens both sides
     if(r.kind!=='mine'&&mine)acts.appendChild(btn('w.compare',function(){
      IDE.emit('compare',{left:{key:w.key,idx:r.idx},right:{rel:relInMod(mine)}})}))}
    tb.appendChild(h('tr',{class:r.winner?'idp-win':null},[h('td',{},[h('b',{text:T(i===0&&r.winner?'w.wins':'w.hidden')})]),
     h('td',{text:whose(r)+' ('+r.layer+')'}),h('td',{class:'idp-where',text:whereOf(r)}),acts]))})}
  function copyFlow(src,rel){dlg.textContent='';
   var out=h('div'),inp=h('input',{type:'text',class:'idp-path',value:rel,'aria-label':T('c.rel')});
   var card=h('div',{class:'idp-card'},[h('b',{text:T('c.h')}),h('div',{class:'idp-head'},[h('span',{class:'hint',text:T('c.rel')}),inp]),out]);
   dlg.appendChild(card);
   function prev(){var b={mod:S.mod,rel:inp.value.trim()},ok=ticket('copy');Object.keys(src).forEach(function(k){b[k]=src[k]});loading(out);
    api(FB+'copy',b).then(function(p){if(!ok())return;out.textContent='';out.appendChild(hint(T('c.to',{p:p.file})));
     if(p.same){out.appendChild(note(T('c.same')));out.appendChild(btn('cancel',function(){dlg.textContent=''}));return}
     if(p.exists){out.appendChild(h('div',{class:'err idp-err',text:T('c.over')}));out.appendChild(diffBox(p.hunks))}else out.appendChild(hint(T('c.new')));
     out.appendChild(h('div',{class:'idp-head'},[btn('c.do',function(){if(!ok())return;b.write=true;
      api(FB+'copy',b).then(function(r){dlg.textContent='';toast(T('c.done',{p:r.rel}));IDE.emit('tree',{});st.which=null;if(S.mod===b.mod)IDE.open({rel:r.rel})})
      .catch(function(e){out.appendChild(errBox(e))})},{primary:true}),btn('cancel',function(){drop('copy');dlg.textContent=''})]))})
    .catch(function(e){if(!ok())return;out.textContent='';out.appendChild(errBox(e))})}
   inp.addEventListener('change',prev);onEnter(inp,prev);prev()}
  return {el:el,draw:draw}}
 function whose(r){return tOr('k.'+r.kind,r.kind)}
 function whereOf(r){return r.kind==='deleted'||r.source==='deleted'?(r.how||T('w.deleted')):(String(r.container||'').replace(/[\\\/]+$/,'')+(r.source==='pak'?' :: ':' / ')+String(r.entry||'').replace(/^[\\\/]+/,''))}
 function relInMod(r){var m=String(S.mod||'').replace(/\\/g,'/').replace(/\/+$/,''),c=String(r.container||'').replace(/\\/g,'/').replace(/\/+$/,'');
  var pre=c.length>m.length&&c.toLowerCase().indexOf(m.toLowerCase())===0?c.slice(m.length+1)+'/':'';return pre+r.entry}

 // ---------------- 4. usages
 function mkUsages(){var box=h('div',{class:'idp-list',role:'list'}),el=h('div',{},[box]);
  function draw(){box.textContent='';var r=st.refs;
   if(!r||st.refsMod!==S.mod){box.appendChild(hint(T('u.how')));return}
   var hits=r.hits||[],name=r.name||'';
   if(!hits.length){box.appendChild(hint(T('u.unknown',{name:name})));return}
   box.appendChild(h('div',{class:'idp-counts',role:'status',text:T('u.head',{name:name,n:hits.length})}));
   if(r.truncated)box.appendChild(note(T('u.cut')));
   var d=active(),own=d&&d.rel?'ide:'+nrel(d.rel)+':':null;
   if(own&&hits.every(function(x){return nrel(String(x.link||'')).indexOf(own)===0}))box.appendChild(hint(T('u.none',{name:name})));
   var left=CAP;
   ['mine','othermod','vanilla'].forEach(function(w){var g=hits.filter(function(x){return (x.where||'vanilla')===w});if(!g.length)return;
    box.appendChild(h('div',{class:'idp-file'},[h('b',{text:T('k.'+w)}),h('span',{class:'idp-dim',text:' ('+g.length+')'})]));
    g.forEach(function(x){if(left<=0)return;left--;
     var row=h('div',{class:'idp-row idp-go',role:'listitem',tabindex:'0'},[h('a',{href:'#',class:'idp-link',text:x.link,onclick:function(e){if(e.preventDefault)e.preventDefault()}}),h('span',{class:'idp-text',text:x.text||''})]);
     function go(){IDE.go(x.link)}
     row.addEventListener('click',go);rowKeys(row,go);box.appendChild(row)})});
   if(hits.length>CAP)box.appendChild(note(T('capped',{n:CAP,all:hits.length})))}
  return {el:el,draw:draw}}

 // ---------------- 5. game log
 function mkLog(){var out=h('div',{class:'idp-list'}),rows=[];
  var readB=btn('l.read',function(){readLog()},{primary:true});
  // the 5 s read waits while the Editor page or the window is hidden (pollLater, page.js): one read when it is seen again.
  // No pollLater (the part outside the page): the timer as before
  function logStop(){var t=st.logTimer;st.logTimer=null;if(!t)return;if(typeof t==='object'&&typeof pollStop==='function')pollStop(t);else clearInterval(t)}
  function logTick(){st.logTimer=null;if(!st.logAuto)return;st.logTimer=pollLater('ide',logTick,5000);if(cur==='log'&&!st.logBusy)readLog(true)}
  var auto=chk('l.auto',st.logAuto,function(v){st.logAuto=v;logStop();if(!v)return;
   if(typeof pollLater==='function'){st.logTimer=pollLater('ide',logTick,5000);return}
   st.logTimer=setInterval(function(){var vis=typeof document==='undefined'||!document.visibilityState||document.visibilityState==='visible';
    if(st.logAuto&&cur==='log'&&vis&&!st.logBusy)readLog(true)},5000)});
  var el=h('div',{},[h('div',{class:'idp-head'},[readB,auto.box,btn('l.next',function(){nextLogError()}),h('span',{class:'hint',text:T('l.lead')})]),out]);
  function setGame(){if(typeof pick!=='function')return;
   pick('dir',typeof gameDir==='function'?gameDir():'',function(p){if(typeof S!=='undefined')S.gameOv=p;   // the shell keeps S.gameOv per game (GS); no global 'game' setting here
    if(typeof loadGame==='function')loadGame();st.log=null;redraw('log')})}
  function draw(){out.textContent='';rows=[];var r=st.log;
   if(!r){out.appendChild(hint(T('l.none0')));return}
   var why=r.why||(r.nogame?'nogame':null);
   if(why==='nogame'){out.appendChild(hint(T('l.nogame')));if(typeof pick==='function')out.appendChild(btn('l.setGame',setGame,{primary:true}));return}
   if(why==='nologs'){out.appendChild(hint(T('l.nologs')));return}
   if(r.error){out.appendChild(errBox(r.error));return}
   // GoH: its own log in its own user folder, and no Play page for GoH (the game is started through Steam)
   var gg='';try{gg=(S&&S.gameId)||''}catch(e){gg=''}
   if(why==='nolog'||!r.file){if(gg==='goh'){out.appendChild(hint(T('l.nologG')));return}out.appendChild(hint(T('l.nolog')));out.appendChild(btn('l.play',function(){if(IDE.goPage)IDE.goPage('play');else show('play')}));return}
   out.appendChild(hint(T('l.file',{p:r.file,t:r.time?new Date(r.time).toLocaleString():'?'})));
   // AS64 and MoW:AS2 write one log folder: the newest log may be the other game's
   if(r.logOf)out.appendChild(note(T('l.logOf',{g:r.logOf==='mowas2'?'MoW:AS2':r.logOf==='goh'?'GoH':'AS64'})));
   var fs=r.findings||[];
   out.appendChild(h('div',{class:'idp-counts',role:'status',text:T('l.count',{n:fs.length})}));
   if(r.truncated)out.appendChild(note(T('l.cut',{n:fs.length})));
   if(!fs.length)out.appendChild(hint(T('l.clean')));
   capList(fs,out,function(f,i){var sev=ICON[f.sev]?f.sev:'info',on=i===st.logSel;
    var kids=[h('span',{class:'idp-sev','aria-label':T('sev.'+sev),title:T('sev.'+sev),text:ICON[sev]}),
     h('span',{class:'idp-msg',text:f.msg||''}),
     h('span',{class:'idp-dim',text:f.count>1?T('l.times',{n:f.count}):''}),
     h('span',{class:'idp-code',text:f.code||''})];
    if(!f.link)kids.push(h('span',{class:'idp-dim idp-nofile',text:T('l.noFile')}));
    var row=h('div',{class:'idp-row idp-'+sev+(f.link?' idp-go':'')+(on?' idp-sel':''),tabindex:f.link||on?'0':null,'aria-current':on?'true':null,'data-i':String(i)},kids);
    if(f.link){var go=function(){st.logSel=i;IDE.go(f.link)};row.addEventListener('click',go);rowKeys(row,go)}
    rows[i]=row;out.appendChild(row)});
   var tail=r.tail||[];
   if(tail.length){var d=h('details',{class:'idp-tail'},[h('summary',{text:T('l.tail',{n:tail.length})}),h('pre',{class:'idp-pre',text:tail.slice(-CAP).join('\n')})]);out.appendChild(d)}}
  return {el:el,draw:draw,row:function(i){return rows[i]||null}}}
 function readLog(quiet,then){if(st.logBusy)return;st.logBusy=true;var p=pane('log'),ok=ticket('log');
  if(!quiet&&cur==='log'){var o=p.el.children[1];if(o)loading(o)}
  api(IB+'log?'+qs({mod:S.mod})).then(function(r){if(!ok())return;st.logBusy=false;st.log=r;st.logSel=-1;
   badge('log',(r.findings||[]).length);IDE.emit('log',{findings:r.findings||[]});redraw('log');if(then)then()})
  .catch(function(e){if(!ok())return;st.logBusy=false;st.log=noGame(e)?{why:'nogame'}:{error:e.message};redraw('log')})}
 function nextLogError(){showTab('log');
  if(!st.log||!st.log.findings){readLog(false,function(){stepErr()});return}
  stepErr()}
 function stepErr(){var fs=(st.log&&st.log.findings)||[],n=Math.min(fs.length,CAP),i=-1,k;
  for(k=1;k<=n;k++){var j=((st.logSel<0?-1:st.logSel)+k)%n;if(fs[j]&&fs[j].sev==='error'){i=j;break}}
  if(i<0){if(IDE.status)IDE.status(T('l.noErr'));return}
  st.logSel=i;redraw('log');var row=pane('log').row(i);if(row&&row.focus)row.focus();
  if(row&&row.scrollIntoView)row.scrollIntoView({block:'nearest'});
  if(fs[i].link)IDE.go(fs[i].link);else if(IDE.status)IDE.status(T('l.noFile'))}

 // ---------------- 6. restore points
 function mkRestore(){var box=h('div',{class:'idp-list'});
  var only=chk('r.only',false,function(v){st.thisOnly=v;draw()});
  var el=h('div',{},[h('div',{class:'idp-head'},[btn('r.reload',function(){st.undo=null;draw()}),only.box,h('span',{class:'hint',text:T('r.lead')})]),box]);
  function draw(){var d=active();only.input.checked=st.thisOnly==null?!!(d&&d.rel):st.thisOnly;
   if(!S.mod){box.textContent='';box.appendChild(hint(T('noMod')));return}
   if(st.undo&&st.undoMod===S.mod){list();return}
   loading(box);var m=S.mod,ok=ticket('undo');
   api(FB+'undo?'+qs({mod:m})).then(function(u){if(!ok())return;st.undo=u;st.undoMod=m;badge('restore',(u.list||[]).length);list()})
   .catch(function(e){if(!ok())return;box.textContent='';box.appendChild(errBox(e))})}
  function list(){box.textContent='';var u=st.undo,d=active(),all=u.list||[];
   if(u.root)box.appendChild(hint(T('r.where',{p:u.root})));
   var rows=all;if(only.input.checked&&d&&d.rel){var dr=nrel(d.rel);rows=all.filter(function(p){return nrel(p.rel)===dr})}
   if(!all.length){box.appendChild(hint(T('r.none')));return}
   if(!rows.length){box.appendChild(hint(T('r.noneFile')));return}
   var tb=h('table',{class:'idp-table'});box.appendChild(tb);
   capList(rows,box,function(p){var out=h('div');
    tb.appendChild(h('tr',{},[h('td',{text:new Date(p.time).toLocaleString()}),h('td',{class:'idp-where',text:p.rel}),
     h('td',{class:'idp-dim',text:tOr('r.act.'+String(p.action).replace(/-/g,''),String(p.action))}),
     h('td',{},[btn('r.preview',function(){prev(p,out)}),out])]))})}
  function prev(p,out){loading(out);var m=S.mod,ok=ticket('rprev:'+p.id);
   api(FB+'restore',{mod:m,id:p.id}).then(function(r){if(!ok())return;out.textContent='';
    if(r.same){out.appendChild(hint(T('r.same')));return}
    if(r.removes)out.appendChild(h('div',{class:'err idp-err',text:T('r.removes',{p:r.file})}));
    else{out.appendChild(hint(T('r.brings',{p:r.file})));out.appendChild(diffBox(r.hunks))}
    out.appendChild(h('div',{class:'idp-head'},[btn('r.do',function(){doRestore(p,r,m,out)},{primary:true}),btn('cancel',function(){drop('rprev:'+p.id);out.textContent=''})]))})
   .catch(function(e){if(!ok())return;out.textContent='';out.appendChild(errBox(e))})}
  function doRestore(p,r,m,out){if(S.mod!==m){out.textContent='';return}
   var rel=r.rel||p.rel,od=IDE.byRef&&rel?IDE.byRef({mod:m,rel:rel}):null;
   // ask first: the open file has text that is not saved, and the restore replaces the file under it
   if(od&&od.dirty&&!confirm(T('r.dirtyQ',{n:od.name||rel})))return;
   api(FB+'restore',{mod:m,id:p.id,write:true}).then(function(w){toast(T('r.done',{id:w.restorePoint||''}));IDE.emit('tree',{});
    if(od)IDE.emit('reload',{mod:m,rel:rel,force:true});st.undo=null;if(S.mod===m)draw()})
   .catch(function(e){out.appendChild(errBox(e))})}
  return {el:el,draw:draw}}

 // ---------------- 7. Notepad++
 function mkNpp(){var stat=h('div',{class:'idp-list'}),planBox=h('div',{class:'idp-list'}),res=h('div',{class:'idp-list'});
  var theme=h('input',{type:'text',class:'idp-path','aria-label':T('n.theme'),placeholder:T('n.themePh'),value:LS.get('ide.p.theme','')});
  function keepTheme(){LS.set('ide.p.theme',theme.value.trim());st.plan=null;upd()}
  theme.addEventListener('change',keepTheme);onEnter(theme,function(){keepTheme();doPlan()});
  var fl=chk('n.fl',!!LS.get('ide.p.n.fl',false),function(v){LS.set('ide.p.n.fl',v);st.plan=null;planBox.textContent='';upd()});
  var planB=btn('n.plan',function(){doPlan()}),instB=btn('n.install',function(){doInstall()},{primary:true}),rmB=btn('n.remove',function(){askRemove()});
  var el=h('div',{},[h('div',{class:'idp-head'},[btn('n.reload',function(){st.npp=null;draw()}),h('span',{class:'hint',text:T('n.lead')})]),stat,
   h('div',{class:'idp-head'},[h('span',{class:'hint',text:T('n.theme')}),theme,
    btn('n.pick',function(){var v=theme.value.trim();pick('file',v?v.replace(/[\\\/][^\\\/]*$/,''):'',function(p){theme.value=p;keepTheme()})})]),
   h('div',{class:'idp-head'},[fl.box]),
   h('div',{class:'idp-head'},[planB,instB,rmB]),planBox,res]);
  function manifest(s){var i=s&&s.installed;if(!i)return null;if(typeof i==='object'&&'manifest' in i)return i.manifest||null;return i}
  function unknownRun(){return !!(st.npp&&st.npp.running==='unknown')}
  function upd(){var p=st.plan;
   instB.disabled=unknownRun()||!(p&&p.theme===theme.value.trim()&&p.fl===fl.input.checked&&!(p.refuse||[]).length&&p.ok!==false)}
  function draw(){upd();if(st.npp){drawStatus(st.npp);return}loading(stat);var ok=ticket('npp',true);
   api(IB+'npp').then(function(s){if(!ok())return;st.npp=s;drawStatus(s);upd()}).catch(function(e){if(!ok())return;stat.textContent='';stat.appendChild(errBox(e))})}
  function drawStatus(s){stat.textContent='';
   stat.appendChild(h('p',{class:'idp-lead',text:s.exe?T('n.found',{v:s.version||'?',p:s.exe}):T('n.notFound')}));
   if(s.settingsDir)stat.appendChild(hint(T('n.settings',{p:s.settingsDir})));
   if(s.running==='unknown')stat.appendChild(h('div',{class:'err idp-err',role:'alert',text:T('n.runUnknown')}));
   else if(s.running)stat.appendChild(note(T('n.running')));
   if(s.portable)stat.appendChild(hint(T('n.portable')));
   if(s.cloud)stat.appendChild(hint(T('n.cloud')));
   var man=manifest(s);
   stat.appendChild(hint(man?T('n.isSet'):T('n.notSet')));
   (s.problems||[]).forEach(function(c){if(c==='RUN_UNKNOWN'&&s.running==='unknown')return;stat.appendChild(note(tOr('n.pr.'+c,tOr('n.rf.'+c,T('n.prX',{c:c})))))});
   rmB.disabled=!man}
  function doPlan(){var th=theme.value.trim(),f=fl.input.checked,ok=ticket('nplan',true),b={action:'plan',theme:th};if(f)b.functionList=true;
   LS.set('ide.p.theme',th);res.textContent='';loading(planBox);
   api(IB+'npp',b).then(function(p){if(!ok())return;p.theme=th;p.fl=f;st.plan=p;upd();drawPlan(p)})
   .catch(function(e){if(!ok())return;st.plan=null;upd();planBox.textContent='';planBox.appendChild(errBox(e))})}
  function drawPlan(p){planBox.textContent='';
   var rf=p.refuse||[];
   if(rf.length){planBox.appendChild(h('b',{text:T('n.refuseH')}));rf.forEach(function(r){planBox.appendChild(h('div',{class:'err idp-err',text:tOr('n.rf.'+r.code,r.msg||r.code)}))})}
   else planBox.appendChild(note(T('n.planOk')));
   if(p.exts&&p.exts.length)planBox.appendChild(hint(T('n.exts',{e:p.exts.join(' ')})));
   if(p.notes&&p.notes.length){planBox.appendChild(h('b',{text:T('n.notesH')}));
    planBox.appendChild(h('ul',{class:'idp-notes'},p.notes.map(function(s){return h('li',{text:String(s)})})))}
   var tg=p.targets||[];
   if(tg.length){var tb=h('table',{class:'idp-table'},[h('tr',{},[h('th',{text:T('n.c.what')}),h('th',{text:T('n.c.path')}),h('th',{text:T('n.c.why')})])]);
    planBox.appendChild(tb);
    capList(tg,planBox,function(t){var why=t.replace?[h('b',{class:'idp-note',text:T('n.replace')}),' '+(t.why||'')]:[t.why||''];
     tb.appendChild(h('tr',{class:'idp-act-'+t.action+(t.replace?' idp-replace':'')},[h('td',{},[h('b',{text:t.replace?T('n.act.replace'):tOr('n.act.'+t.action,t.action)})]),h('td',{class:'idp-where',text:t.path}),h('td',{},why)]));
     if(t.diff){var txt=typeof t.diff==='string'?t.diff:Array.isArray(t.diff)?(t.diff.length&&typeof t.diff[0]==='object'?null:t.diff.join('\n')):JSON.stringify(t.diff,null,1);
      tb.appendChild(h('tr',{},[h('td',{text:T('n.diff')}),h('td',{colspan:'2'},[txt==null?diffBox(t.diff):h('pre',{class:'idp-pre',text:txt})])]))}})}
   (p.elevated||[]).forEach(function(x){var ta=h('textarea',{class:'idp-cmd',readonly:true,rows:'2',spellcheck:'false','aria-label':T('n.elevCmd')});ta.value=x.cmd;
    var kids=[h('div',{text:T('n.elev',{from:x.from,to:x.to})})];
    if(x.overwrites)kids.push(h('div',{class:'err idp-err',role:'alert',text:T('n.overwrites',{p:x.to})}));
    kids.push(ta);
    kids.push(btn('n.copyCmd',function(){try{if(navigator.clipboard)navigator.clipboard.writeText(x.cmd).then(function(){toast(T('n.copied'))},function(){ta.select()});else ta.select()}catch(e){ta.select()}}));
    planBox.appendChild(h('div',{class:'idp-card'+(x.overwrites?' idp-danger':'')},kids))})}
  function doInstall(){var p=st.plan,s=st.npp||{};if(!p||unknownRun())return;
   if(!confirm(T('n.confirm',{p:s.settingsDir||'?'})))return;loading(res);
   var b={action:'install',theme:p.theme},ok=ticket('ninst',true);if(p.fl)b.functionList=true;
   api(IB+'npp',b).then(function(r){if(!ok())return;res.textContent='';st.npp=null;st.plan=null;upd();
    if(r.ok===false&&r.partial){showPartial(r);draw();return}
    if((r.refuse||[]).length){drawPlan(r);res.appendChild(errBox(T('n.notDone')));return}
    res.appendChild(note(T('n.done')));if(r.backup)res.appendChild(hint(T('n.backup',{p:r.backup})));
    res.appendChild(h('p',{class:'idp-lead',text:T('n.pickTheme')}));draw()})
   .catch(function(e){if(!ok())return;res.textContent='';res.appendChild(errBox(e))})}
  function showPartial(r){var w=r.written||[];
   res.appendChild(h('div',{class:'err idp-err',role:'alert',text:T('n.failed',{m:r.error||'?'})}));
   res.appendChild(h('b',{text:T('n.written',{n:w.length})}));
   w.slice(0,CAP).forEach(function(x){res.appendChild(h('div',{class:'idp-where',text:'+ '+x}))});
   if(r.backup)res.appendChild(hint(T('n.backup',{p:r.backup})));
   res.appendChild(h('div',{class:'idp-head'},[btn('n.rmWritten',function(){if(confirm(T('n.rmConfirm')))doRemove()},{primary:true})]))}
  // Remove: the route has no dry run, so the list comes from the manifest in the status answer
  function askRemove(){var man=manifest(st.npp);res.textContent='';
   if(!man){res.appendChild(hint(T('n.rmNone')));return}
   var files=(man.files||[]).map(function(f){return typeof f==='string'?f:f.path}),cmds=man.commands||[];
   var card=h('div',{class:'idp-card'},[h('b',{text:T('n.rmList',{n:files.length})})]);
   files.slice(0,CAP).forEach(function(x){card.appendChild(h('div',{class:'idp-where',text:'- '+x}))});
   if(files.length>CAP)card.appendChild(note(T('capped',{n:CAP,all:files.length})));
   if(cmds.length)card.appendChild(hint(T('n.rmCmds',{c:cmds.join(', ')})));
   if(man.partial)card.appendChild(note(T('n.rmPartial')));
   card.appendChild(hint(T('n.rmKeep')));
   card.appendChild(h('div',{class:'idp-head'},[btn('n.rmDo',function(){if(confirm(T('n.rmConfirm')))doRemove()},{primary:true}),btn('cancel',function(){res.textContent=''})]));
   res.appendChild(card)}
  function doRemove(){loading(res);var ok=ticket('nrm',true);
   api(IB+'npp',{action:'uninstall'}).then(function(r){if(!ok())return;res.textContent='';st.npp=null;
    var rf=r.refuse||[];
    if(rf.length){res.appendChild(h('b',{text:T('n.refuseH')}));rf.forEach(function(x){res.appendChild(h('div',{class:'err idp-err',text:tOr('n.rf.'+x.code,x.msg||x.code)}))});draw();return}
    if(r.note)res.appendChild(hint(String(r.note)));
    var rm=r.removed||[],kp=r.kept||[];
    res.appendChild(note(T('n.removed',{n:rm.length})));rm.slice(0,CAP).forEach(function(x){res.appendChild(h('div',{class:'idp-where',text:'- '+x}))});
    if(kp.length){res.appendChild(h('b',{text:T('n.kept',{n:kp.length})}));kp.slice(0,CAP).forEach(function(x){res.appendChild(h('div',{class:'idp-where',text:x.path+(x.why?'  ('+x.why+')':'')}))})}
    draw()}).catch(function(e){if(!ok())return;res.textContent='';res.appendChild(errBox(e))})}
  return {el:el,draw:draw}}

 // ---------------- events from the shell
 IDE.on('active',function(){st.whichRef=null;pane('problems').draw();if(cur==='which'||cur==='restore'||cur==='usages')redraw(cur)});
 IDE.on('lint',function(e){var d=active();st.lint=e||null;if(!d||!e||e.doc===d)pane('problems').draw()});
 IDE.on('closed',function(){pane('problems').draw()});
 IDE.on('saved',function(){st.undo=null;if(cur==='restore')redraw('restore')});
 IDE.on('mod',function(){['search','which','copy','undo','log','usages'].forEach(drop);
  st.sr=null;st.which=null;st.whichQ='';st.undo=null;st.log=null;st.logBusy=false;st.logSel=-1;st.refs=null;
  if(panes.search)panes.search.draw();
  ['search','log','restore','usages'].forEach(function(t){badge(t,0)});redraw(cur)});
 IDE.on('search',function(e){showTab('search');if(e&&e.q!=null)pane('search').run(String(e.q))});
 IDE.on('which',function(e){st.whichRef=e&&e.ref||null;showTab('which')});
 IDE.on('refs',function(e){st.refs=e||null;st.refsMod=S.mod;badge('usages',e&&e.hits?e.hits.length:0);showTab('usages')});
 if(IDE.action&&IDE.actions&&!IDE.actions.readLog){
  IDE.action('readLog',{label:'ide.p.l.read',tip:'ide.p.l.readT',key:null,group:'log',bar:false,run:function(){showTab('log');readLog()}});
  IDE.action('nextLogError',{label:'ide.p.l.next',tip:'ide.p.l.nextT',key:null,group:'log',run:nextLogError,when:function(){return !!S.mod}});
  IDE.action('findInFiles',{label:'ide.p.s.find',tip:'ide.p.s.findT',key:'Ctrl+Shift+F',group:'jump',run:function(){showTab('search');pane('search').focus()}})}

 showTab(cur);
 return {show:showTab,refresh:function(){pane('problems').draw();redraw(cur)}}};
})();
`,
  css: [
    '.idp{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px}',
    '.idp-tabs{flex:none;display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding:2px 4px}',
    '.idp-tab{background:none;border:0;border-bottom:2px solid transparent;padding:3px 8px;cursor:pointer;color:inherit}',
    '.idp-tab.idp-on{border-bottom-color:var(--acc);font-weight:600}',
    '.idp-tab:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}',
    '.idp-badge{margin-left:5px;padding:0 5px;border-radius:8px;background:var(--badge);font-size:11px}',
    '.idp-body{flex:1 1 auto;min-height:0;overflow:auto;padding:4px 8px}',
    '.idp-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:2px 0 4px}',
    '.idp-head input[type=text]{min-width:14em;flex:1 1 14em}',
    '.idp-head>.sk{display:flex;flex:1 1 20em;min-width:14em}','.idp-head>.sk>input[type=text]{min-width:8em}',
    '.idp-row{display:flex;align-items:baseline;gap:8px;padding:1px 4px;border-radius:3px}',
    '.idp-go{cursor:pointer}.idp-go:hover,.idp-go:focus{background:var(--hov);outline:none}',
    '.idp-sel{background:var(--sel);box-shadow:inset 3px 0 var(--acc)}',
    '.idp-sev{width:1.2em;text-align:center;flex:none}.idp-error .idp-sev{color:var(--err)}.idp-warn .idp-sev{color:var(--iw)}.idp-info .idp-sev{color:var(--acc)}',
    '.idp-pos{flex:none;min-width:4.5em;color:var(--hint);font-family:Consolas,monospace}',
    '.idp-msg{flex:1 1 auto;min-width:0}.idp-text{flex:1 1 auto;min-width:0;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-all}',
    '.idp-code,.idp-dim{color:var(--hint);font-size:12px}.idp-acts{display:inline-flex;gap:4px;flex:none}',
    '.idp-nofile{font-style:italic;flex:none}',
    '.idp-acts button{padding:0 6px;font-size:12px}',
    '.idp-explain{margin:2px 0 6px 2.4em;padding:4px 8px;border-left:3px solid var(--acc)}',
    '.idp-file{margin-top:6px;word-break:break-all}.idp-hit{background:var(--whol);color:inherit;border-radius:2px}',
    '.idp-table{border-collapse:collapse;width:100%}.idp-table td,.idp-table th{padding:2px 6px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line2)}',
    '.idp-where{word-break:break-all;font-family:Consolas,monospace;font-size:12px}',
    '.idp-win td{background:var(--qp)}.idp-lead{margin:2px 0 4px}.idp-note{color:var(--iw)}.idp-err{margin:2px 0}',
    '.idp-replace td{background:var(--who)}.idp-danger{border-color:var(--err)}',
    '.idp-notes{margin:2px 0 6px;padding-left:1.4em;font-size:12px}',
    '.idp-diff,.idp-pre{font-family:Consolas,monospace;font-size:12px;white-space:pre;overflow:auto;max-height:18em;margin:4px 0;padding:4px;background:var(--pre)}',
    '.idp-del{color:var(--err)}.idp-add{color:var(--ok)}.idp-dh{color:var(--hint)}',
    '.idp-card{border:1px solid var(--line);border-radius:4px;padding:6px;margin:4px 0}',
    '.idp-cmd{width:100%;font-family:Consolas,monospace;font-size:12px;box-sizing:border-box}',
    '.idp-chk{white-space:nowrap}.idp-link{font-family:Consolas,monospace;flex:none}',
  ].join('\n'),
};
