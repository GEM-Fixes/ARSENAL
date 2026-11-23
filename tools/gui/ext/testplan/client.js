// Browser side of the Test Plan page. Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent.
// Five cards, top to bottom: what changed, the tests in the game for it (rows), test in the game (run files, dry run, run, read
// results), the list for the player, mark as tested. Files are checked on Mods > Check & Fix: this page holds one line and a link. Routes: /api/x/testplan/* (index.js). Nothing is asked before the page is first shown. The plan of a new choice is made by a
// background job: the page then asks status every 1.5 s (pollLater: not while the page is hidden) and asks for the plan again at the end.
// The rows filter is the shared searchKit (history test.plan.q, index = codes, checks, units and weapons of the plan, Browse = a mod
// file whose rows are then shown); the server filters, so a plan of every model and every gun stays light here (200 rows drawn).
// Game runs go through streamRun with the contract commands edrun and prove and the input the server made from the emitted command
// line; a real run carries data-launch (the launch gate) and asks first with the core confirm text. MoW:AS2: dry run and plan only.
// GoH: no run button, the commands are text to copy.
// Checklist sentences: testplan.cl.<key>.do|.look with the entry's args; the tool's English sentence when a key or a slot is missing.
// Author: Imperator_Aug (ARSENAL, ia-0f28c372)
module.exports = String.raw`
EXT_SCREENS.testplan=function(root){
 var R='/api/x/testplan/';
 var V=null,loaded=false,sig=null,seq=0,poll=null,watching='',spins=0,typeT=null,openRows={};
 var Q={since:String(LS.get('test.plan.since','last')||'last'),ref:String(LS.get('test.plan.ref','')||''),q:'',file:'',show:''};
 if(['last','1d','7d','git','all'].indexOf(Q.since)<0)Q.since='last';
 function el(t,a,k){return h(t,a,k)}
 function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
 function known(k){return tx(k)!==k}
 function kind(){try{var g=curGame();if(g&&g.kind==='goh')return 'goh'}catch(e){}return GID==='mowas2'?'mowas2':'as64'}
 function errText(e){if(e&&e.key&&known(e.key))return tx(e.key,e.params||{});return String((e&&(e.text||e.message))||e)}
 function say(n,cls,t){n.className=cls;n.textContent=t==null?'':t;return n}
 function when(at){try{var d=new Date(at);return isNaN(d.getTime())?String(at||''):d.toLocaleString()}catch(e){return String(at||'')}}
 function word(pre,v){var k=pre+v;return known(k)?tx(k):String(v||'')}
 function hintEl(t){return el('div',{class:'hint',text:t})}
 function body(o){var b={mod:S.mod||'',since:Q.since==='git'?(Q.ref?'git:'+Q.ref:'git'):Q.since==='all'?'last':Q.since,everything:Q.since==='all'};
  if(o)Object.keys(o).forEach(function(k){b[k]=o[k]});return b}
 function filt(){var b={q:Q.q,file:Q.file,limit:200};if(Q.show==='player')b.how='player';else if(Q.show)b.status=Q.show;return b}
 function sums(){var s=(V&&V.summary)||{};return {p:s.passed||0,f:s.failed||0,o:s.open||0}}

 // ---------- top ----------
 var needMod=el('div',{class:'err',text:tx('testplan.needmod')}),needGame=el('div',{class:'err','data-nogame':'1',text:tx('testplan.needgame'),hidden:true});

 // ---------- 1. what changed ----------
 var sinceSel=el('select',{'aria-label':tx('testplan.ch.since')},[['last','testplan.ch.last'],['1d','testplan.ch.day'],['7d','testplan.ch.week'],['git','testplan.ch.git'],['all','testplan.ch.all']].map(function(o){return el('option',{value:o[0],text:tx(o[1])})}));
 sinceSel.value=Q.since;
 var refIn=el('input',{type:'text','aria-label':tx('testplan.ch.ref'),placeholder:'HEAD~1',maxlength:'120'});refIn.value=Q.ref;
 var refFld=fld('chg.ref',tx('testplan.ch.ref'),refIn);refFld.hidden=Q.since!=='git';
 var reloadBtn=el('button',{type:'button',text:tx('testplan.ch.reload'),onclick:function(){load({force:true})}});
 var chState=el('div',{class:'hint'}),filesBox=el('div'),markLine=el('div',{class:'hint'}),whereLine=el('div',{class:'hint',hidden:true});
 sinceSel.addEventListener('change',function(){Q.since=sinceSel.value;LS.set('test.plan.since',Q.since);refFld.hidden=Q.since!=='git';spins=0;load()});
 refIn.addEventListener('change',function(){Q.ref=String(refIn.value||'').trim();LS.set('test.plan.ref',Q.ref);if(Q.since==='git'){spins=0;load()}});
 function drawChanges(){clear(filesBox);
  if(!V){markLine.textContent='';whereLine.hidden=true;return}
  var ch=V.changes||{},c=ch.counts||{},n=ch.filesTotal||0,fs=ch.files||[];
  say(chState,'hint',n?tx('testplan.ch.count',{n:n,a:c.added||0,c:c.changed||0,r:c.removed||0}):tx('testplan.ch.none'));
  if(n){var ul=el('ul',{style:'margin:4px 0 4px 18px;padding:0'});
   fs.forEach(function(f){ul.appendChild(el('li',{},[el('span',{class:'badge',text:word('testplan.f.',f.state)}),document.createTextNode(' '+f.rel)]))});
   var d=el('details',{'data-files':'1'},[el('summary',{text:tx('testplan.ch.files')}),ul]);
   if(n>fs.length)d.appendChild(hintEl(tx('testplan.ch.more',{n:n-fs.length})));
   filesBox.appendChild(d)}
  (ch.notes||[]).concat(V.notes||[]).slice(0,12).forEach(function(t){filesBox.appendChild(hintEl(String(t&&t.text||t)))});
  var m=V.lastMark;say(markLine,'hint',m?tx('testplan.ch.marked',{at:when(m.at),n:m.files==null?'?':m.files}):tx('testplan.ch.never'));
  var st=V.state||{};whereLine.hidden=!st.dir||(!!st.own&&!st.both);whereLine.textContent=!st.dir?'':st.both?tx('testplan.state.both',{dir:st.dir,other:st.other||''}):st.own?'':tx('testplan.state.other',{dir:st.dir})}
 // files are checked on Mods > Check & Fix: one line and the link, no check and no fix feature here
 var chkBtn=el('button',{type:'button','data-check':'1',text:tx('testplan.ch.checkgo'),onclick:function(){if(typeof show==='function')show('check')}});
 var chgCard=card('chg',[blk('chg.title',[el('h3',{text:tx('testplan.ch.h')})]),blk('chg.intro',[hintEl(tx('testplan.ch.intro'))]),
  fld('chg.since',tx('testplan.ch.since'),sinceSel),refFld,
  h('div',{class:'row',blk:'chg.btns','data-blkname':tx('testplan.b.btns')},[reloadBtn]),blk('chg.state',[chState],{name:tx('testplan.b.state')}),
  blk('chg.files',[filesBox],{name:tx('testplan.b.files')}),blk('chg.mark',[markLine],{name:tx('testplan.b.mark')}),blk('chg.where',[whereLine],{name:tx('testplan.b.where')}),
  h('div',{class:'row',blk:'chg.check','data-blkname':tx('testplan.b.check')},[el('span',{class:'hint',text:tx('testplan.ch.check')}),chkBtn])],{name:tx('testplan.ch.h')});

 // ---------- 2. tests for these changes ----------
 var chips=el('div',{class:'row'}),rTb=el('tbody'),rCount=el('div',{class:'hint'}),rMore=el('div',{class:'hint'});
 var rTbl=el('table',{},[el('thead',{},[el('tr',{},[el('th',{class:'nw',text:tx('testplan.col.code')}),el('th',{text:tx('testplan.col.check')}),el('th',{class:'nw',text:tx('testplan.col.status')}),el('th',{class:'nw',text:tx('testplan.col.how')})])]),rTb]);
 var qIn=el('input',{type:'text','aria-label':tx('testplan.q.label'),placeholder:tx('testplan.q.ph')});
 var showSel=el('select',{'aria-label':tx('testplan.show.label'),title:tx('testplan.show.label')},[['','testplan.show.all'],['fail','testplan.show.fail'],['open','testplan.show.open'],['pass','testplan.show.pass'],['player','testplan.show.player']].map(function(o){return el('option',{value:o[0],text:tx(o[1])})}));
 var fileLine=el('span',{class:'hint'}),fileClr=el('button',{type:'button',text:tx('testplan.q.clear'),onclick:function(){Q.file='';drawFile();load({quiet:true,rowsOnly:true})}}),fileBox=el('div',{class:'row',hidden:true},[fileLine,fileClr]);
 function drawFile(){fileBox.hidden=!Q.file;fileLine.textContent=Q.file?tx('testplan.q.file',{f:Q.file}):''}
 function applyQ(){clearTimeout(typeT);typeT=null;var v=String(qIn.value||'').trim();if(v===Q.q)return;Q.q=v;load({quiet:true,rowsOnly:true})}
 qIn.addEventListener('input',function(){clearTimeout(typeT);typeT=setTimeout(applyQ,350)});
 qIn.addEventListener('change',applyQ);
 showSel.addEventListener('change',function(){Q.show=showSel.value;load({quiet:true,rowsOnly:true})});
 var kit=searchKit(qIn,{key:'test.plan.q',cap:40,
  index:function(q,done){var ix=(V&&V.index)||[],lo=String(q||'').toLowerCase(),out=[],more=0;
   for(var i=0;i<ix.length;i++){var it=ix[i];if(lo&&(String(it.label)+' '+String(it.value)).toLowerCase().indexOf(lo)<0)continue;if(out.length<80)out.push(it);else more++}
   done(out,more)},
  browse:{mode:'file',start:function(){return S.mod||''},toValue:function(p){return p}},
  onPick:function(v,item,from){if(from==='browse'){Q.file=String(v||'');drawFile();load({quiet:true,rowsOnly:true});return}qIn.value=String(v==null?'':v);applyQ()}});
 function badge(st){return el('span',{class:'badge'+(st==='pass'?' good':st==='fail'?' badx':st==='todo'||st==='unproven'||st==='void'||st==='held'?' info':''),text:word('testplan.status.',st)})}
 function drawChips(){clear(chips);if(!V)return;var s=V.summary||{},bh=s.byHow||{};
  [['testplan.chip.run',bh.run||0,''],['testplan.chip.player',bh.player||0,''],['testplan.chip.pass',s.passed||0,' good'],['testplan.chip.fail',s.failed||0,s.failed?' badx':''],['testplan.chip.open',s.open||0,s.open?' info':'']]
   .forEach(function(c){chips.appendChild(el('span',{class:'badge'+c[2],'data-chip':c[0].slice(14),text:tx(c[0],{n:String(c[1])+''})}))})}
 function findText(f){if(f==null)return '';if(typeof f!=='object')return String(f);var t=String(f.msg||f.text||f.message||f.code||'');if(f.code&&f.msg)t=f.code+': '+t;
  if(f.file)t+=' ('+f.file+(f.line?':'+f.line:'')+')';return t}
 function detail(r){var kids=[],t=r.target||{},res=r.result||{};
  var tl=Object.keys(t).filter(function(k){return t[k]!=null&&t[k]!==''&&typeof t[k]!=='object'}).map(function(k){return word('testplan.d.t.',k)+': '+t[k]});
  function ln(label,text){kids.push(el('div',{},[el('b',{text:label+': '}),document.createTextNode(text)]))}
  if(tl.length)ln(tx('testplan.d.target'),tl.join(', '));
  if(r.expect)ln(tx('testplan.d.expect'),String(r.expect));
  if(r.why&&r.how==='player')ln(tx('testplan.d.why'),String(r.why));
  var fs=res.findings||[];
  if(fs.length){kids.push(el('b',{text:tx('testplan.d.findings')}));var ul=el('ul',{style:'margin:2px 0 2px 18px;padding:0'});
   fs.forEach(function(f){ul.appendChild(el('li',{class:f&&/^(err|error|fail)/i.test(String(f.severity||''))?'err':'',text:findText(f)}))});kids.push(ul);
   if(res.findingsTotal>fs.length)kids.push(hintEl(tx('testplan.d.findmore',{n:res.findingsTotal-fs.length})))}
  else kids.push(hintEl(tx('testplan.d.nofind')));
  if(res.note)ln(tx('testplan.d.note'),String(res.note));
  if((r.limits||[]).length)ln(tx('testplan.d.limits'),r.limits.join(', '));
  return el('tr',{'data-detail':r.code},[el('td',{colspan:'4'},kids)])}
 function drawRows(){clear(rTb);drawChips();
  if(!V){rCount.textContent='';rMore.textContent='';return}
  var rows=V.rows||[],last=null;
  rows.forEach(function(r){
   if(r.item!==last){last=r.item;rTb.appendChild(el('tr',{'data-item':r.item},[el('td',{colspan:'4'},[el('b',{text:r.name||r.item}),document.createTextNode(r.kind?' ('+word('testplan.d.t.',r.kind)+')':'')])]))}
   var btn=el('button',{type:'button',text:r.code,'aria-expanded':openRows[r.id]?'true':'false',title:r.id}),det=null;
   var tr=el('tr',{'data-row':r.code,style:'cursor:pointer'},[el('td',{class:'nw'},[btn]),el('td',{text:r.title||r.check}),el('td',{class:'nw'},[badge(r.status)]),el('td',{class:'nw',text:word('testplan.how.',r.how)})]);
   function tog(){if(det){if(det.parentNode)det.parentNode.removeChild(det);det=null;delete openRows[r.id];btn.setAttribute('aria-expanded','false');return}
    det=detail(r);openRows[r.id]=1;btn.setAttribute('aria-expanded','true');if(tr.nextSibling)rTb.insertBefore(det,tr.nextSibling);else rTb.appendChild(det)}
   btn.addEventListener('click',function(e){if(e&&e.stopPropagation)e.stopPropagation();tog()});tr.addEventListener('click',tog);
   rTb.appendChild(tr);if(openRows[r.id]){det=detail(r);rTb.appendChild(det)}});
  var tot=V.rowsTotal||0,mt=V.rowsMatched||0;
  rCount.textContent=!tot?tx('testplan.rows.none'):!mt?tx('testplan.rows.nomatch'):tx('testplan.rows.count',{n:String(rows.length)+'',m:tot});
  rMore.textContent=mt>rows.length?tx('testplan.rows.more',{n:String(mt-rows.length)+''}):''}
 var rowsCard=card('rows',[blk('rows.title',[el('h3',{text:tx('testplan.rows.h')})]),blk('rows.intro',[hintEl(tx('testplan.rows.intro'))]),
  blk('rows.chips',[chips],{name:tx('testplan.b.chips')}),
  h('div',{class:'row',blk:'rows.filter','data-blkname':tx('testplan.b.filter')},[kit.el,showSel]),blk('rows.file',[fileBox],{name:tx('testplan.b.file')}),
  blk('rows.count',[rCount],{name:tx('testplan.b.counts')}),blk('rows.table',[el('div',{class:'scroll'},[rTbl])],{name:tx('testplan.b.table')}),blk('rows.more',[rMore])],{name:tx('testplan.rows.h')});

 // ---------- 3. test in the game ----------
 var naBox=el('div'),runLine=el('div',{class:'hint'}),cmdBox=el('div'),log=mkLog();
 var makeBtn=el('button',{type:'button',class:'primary',text:tx('testplan.run.make'),onclick:makeRuns}),readBtn=el('button',{type:'button',text:tx('testplan.run.read'),onclick:readRuns});
 function naLine(key){var g='';try{g=curGame().name}catch(e){}return el('div',{class:'hint','data-na':key},[el('b',{text:tx('na.line',{g:g,why:tx(key)})})])}
 function drawNa(){clear(naBox);var K=kind();readBtn.hidden=K==='goh';
  if(K==='mowas2'){naBox.appendChild(naLine('testplan.na.edrun.mowas2'));naBox.appendChild(naLine('testplan.na.prove.mowas2'))}
  else if(K==='goh')naBox.appendChild(naLine('testplan.na.run.goh'))}
 function copy(text,line){var ok=function(){say(line,'ok',tx('testplan.run.copied'))},no=function(){say(line,'err',tx('testplan.run.nocopy'))};
  try{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(ok,no);else no()}catch(e){no()}}
 function runBtn(c,real){var ed=c.runner==='edrun',b=el('button',{type:'button','data-run':'1','data-real':real?'1':null,class:real?'danger':'',text:tx(real?'testplan.run.real':ed?'testplan.run.dry':'testplan.run.plan'),onclick:function(){startRun(c,real)}});
  if(real){b.dataset.launch='1';b.dataset.tip='';if(!S.health.allowLaunch){b.dataset.blocked='1';b.title=tx('run.blocked');b.disabled=true}}return b}
 function startRun(c,real,asked){
  if(typeof RUN!=='undefined'&&RUN){if(typeof busyMsg==='function')busyMsg();return}
  if(real&&!S.health.allowLaunch){say(runLine,'err',tx('run.blocked'));return}
  var ed=c.runner==='edrun',input={};Object.keys(c.input||{}).forEach(function(k){input[k]=c.input[k]});
  if(ed)input.dry=!real;else input.plan=!real;
  // MoW:AS2 has no real run (TST-19): its own exe, and the dry run or the plan whatever was asked
  var x=testExe(ed?'ed':'pv',input.game);if(x){input.exe=x;if(ed)input.dry=true;else input.plan=true}
  if(kind()!=='as64'){if(ed)input.dry=true;else input.plan=true}
  if(real&&!asked){askDo({title:tx('testplan.run.real')+': '+c.id,lines:[tx(ed?'ed.confirm':'pv.confirm')],danger:true}).then(function(y){if(y)startRun(c,true,true)});return}
  log.clear();say(runLine,'hint',tx('testplan.run.going',{id:c.id}));
  streamRun(c.runner,input,{line:function(k,t){log.add(k,t)},start:function(){},end:function(){}}).then(function(end){
   if(!end){say(runLine,'err',tx('testplan.run.end.bad',{id:c.id,code:'?'}));return}
   var good=end.code===0&&!end.cancelled&&!end.timedOut;say(runLine,good?'ok':'err',tx(good?'testplan.run.end.ok':'testplan.run.end.bad',{id:c.id,code:end.code}))})}
 function drawCmds(j){clear(cmdBox);if(!j)return;var K=kind(),can=j.canRun||{},cs=j.commands||[];
  if(!cs.length){cmdBox.appendChild(hintEl(tx('testplan.run.none')));return}
  cmdBox.appendChild(hintEl(tx('testplan.run.files',{n:String((j.files||[]).length)+'',dir:j.out})));
  if(K==='goh')cmdBox.appendChild(hintEl(tx('testplan.run.goh.cmds')));
  cs.forEach(function(c){var mine=c.runner==='edrun'||c.runner==='prove',isRun=mine&&!!c.input&&!c.partial&&K!=='goh'&&can[c.runner]!=='no',real=isRun&&K==='as64'&&can[c.runner]==='run';
   var said=el('span',{class:'hint'}),kids=[el('b',{text:c.id}),el('span',{class:'badge',text:tx('testplan.run.rows',{n:String(c.rows)+''})})];
   if(isRun){kids.push(el('span',{class:'badge',text:tx('testplan.run.k.dry')}));kids.push(runBtn(c,false));if(real){kids.push(el('span',{class:'badge info',text:tx('testplan.run.k.real')}));kids.push(runBtn(c,true))}}
   else kids.push(el('span',{class:'badge info',text:tx('testplan.run.k.text')}));
   kids.push(el('button',{type:'button','data-copy':'1',text:tx('testplan.run.copy'),onclick:function(){copy(c.cmd,said)}}));kids.push(said);
   cmdBox.appendChild(el('div',{class:'row','data-cmd':c.id},kids));
   if(!isRun){if(mine&&c.partial&&K!=='goh')cmdBox.appendChild(hintEl(tx('testplan.run.partial')));cmdBox.appendChild(el('pre',{class:'log',tabindex:'0',text:c.cmd}))}});
  (j.notes||[]).slice(0,12).forEach(function(t){cmdBox.appendChild(hintEl(String(t&&t.text||t)))});
  if(typeof setRunUi==='function')setRunUi()}
 function makeRuns(){if(!S.mod){say(runLine,'err',tx('testplan.needmod'));return}runLine.textContent='';
  api(R+'emit',body(),{what:tx('testplan.job.emit')}).then(function(j){drawCmds(j)},function(e){say(runLine,e&&e.cancelled?'hint':'err',errText(e))})}
 function readRuns(){if(!S.mod){say(runLine,'err',tx('testplan.needmod'));return}
  api(R+'read',body(filt()),{what:tx('testplan.job.read')}).then(function(j){if(j&&j.pending){watch(j.running||'plan');return}setView(j);say(runLine,'ok',tx('testplan.run.readDone',sums()))},function(e){say(runLine,e&&e.cancelled?'hint':'err',errText(e))})}
 var runCardEl=card('run',[blk('run.title',[el('h3',{text:tx('testplan.run.h')})]),blk('run.intro',[hintEl(tx('testplan.run.intro'))]),blk('run.na',[naBox],{name:tx('testplan.b.na')}),
  h('div',{class:'row',blk:'run.btns','data-blkname':tx('testplan.b.btns')},[makeBtn,readBtn]),blk('run.state',[runLine],{name:tx('testplan.b.state')}),
  blk('run.cmds',[cmdBox],{name:tx('testplan.b.cmds')}),blk('run.log',[log.el],{name:tx('testplan.b.log')})],{name:tx('testplan.run.h')});

 // ---------- 4. for you to test in the game ----------
 var clCounts=el('div',{class:'hint'}),clBox=el('div'),clOut=el('div',{class:'hint'});
 var FILL={foe:'testplan.cl.foe.any',carrier:'testplan.cl.carrier.any',army:'testplan.cl.army.any'};
 function enOf(k){try{return LANGS.en[k]}catch(e){return null}}
 // the sentence of a key in the page language; the tool's English sentence when the key is not known here or a slot stays empty
 function clText(key,args,fb){var k='testplan.cl.'+key;if(!key||!known(k))return fb||'';var a={};Object.keys(args||{}).forEach(function(n){a[n]=args[n]});
  Object.keys(FILL).forEach(function(n){if(a[n]!=null&&String(a[n])===enOf(FILL[n]))a[n]=tx(FILL[n])});
  var s=tx(k,a);return /\{\w+\}/.test(s)?(fb||s):s}
 function drawCounts(){var c=V&&V.checklist&&V.checklist.counts;clCounts.textContent=c&&c.entries?tx('testplan.cl.counts',{n:String(c.entries)+'',p:c.pass,f:c.fail,s:c.skip,o:c.open}):''}
 function entryEl(e){var st=e.status,boxes={},msg=el('span',{class:'hint'});
  var note=el('input',{type:'text','aria-label':tx('testplan.cl.note')+' '+e.code,placeholder:tx('testplan.cl.notePh'),maxlength:'500','data-note':e.code});note.value=e.note||'';
  function setV(v){['pass','fail','skip'].forEach(function(x){boxes[x].checked=x===v})}
  function send(v){var prev=st;st=v;setV(v);msg.className='hint';msg.textContent='';
   api(R+'tick',body({code:e.code,v:v,note:note.value}),{what:tx('testplan.job.tick')}).then(function(j){e.status=v;e.note=j.note;ticked(j,e.code,v)},
    function(er){st=prev;setV(prev);say(msg,'err',tx('testplan.cl.tickfail',{m:errText(er)}))})}
  var ticks=[['pass','testplan.cl.pass'],['fail','testplan.cl.fail'],['skip','testplan.cl.skip']].map(function(o){
   var cb=el('input',{type:'checkbox','data-tick':o[0],'data-code':e.code});cb.checked=st===o[0];boxes[o[0]]=cb;
   cb.addEventListener('change',function(){send(o[0])});return el('label',{class:'chk'},[cb,el('span',{text:tx(o[1])})])});
  note.addEventListener('change',function(){if(st==='pass'||st==='fail'||st==='skip')send(st)});
  var kids=[el('div',{},[el('span',{class:'badge',text:e.code}),document.createTextNode(' '+clText(e.key?e.key+'.do':'',e.args,e['do']))]),
   el('div',{class:'hint'},[el('b',{text:tx('testplan.cl.look')+' '}),document.createTextNode(clText(e.key?e.key+'.look':'',e.args,e.look))])];
  if(e.expect)kids.push(el('div',{class:'hint'},[el('b',{text:tx('testplan.cl.expect')+' '}),document.createTextNode(String(e.expect))]));
  if(e.recheck)kids.push(el('div',{class:'err',text:tx('testplan.cl.recheck')}));
  kids.push(el('div',{class:'row'},ticks.concat([note,msg])));
  return el('div',{class:'wzstat','data-entry':e.code,style:'margin:6px 0'},kids)}
 function ticked(j,code,v){if(!V)return;V.summary=j.summary||V.summary;if(V.checklist)V.checklist.counts=j.counts||V.checklist.counts;
  (V.rows||[]).forEach(function(r){if(r.code===code)r.status=v});drawRows();drawCounts()}
 function drawList(){clear(clBox);drawCounts();clOut.textContent='';if(!V)return;var cl=V.checklist,ss=(cl&&cl.sessions)||[];
  if(!ss.length){clBox.appendChild(hintEl(tx('testplan.cl.none')));return}
  ss.forEach(function(s){clBox.appendChild(el('h4',{'data-session':s.id,text:clText(s.titleKey,s.titleArgs,s.title)}));
   var su=s.setup||[],sk=s.setupKeys||[];
   if(su.length){clBox.appendChild(el('b',{text:tx('testplan.cl.setup')}));var ol=el('ol',{style:'margin:2px 0 6px 22px;padding:0'});
    su.forEach(function(t,i){var k=sk[i]||{};ol.appendChild(el('li',{text:clText(k.key,k.args,String(t))}))});clBox.appendChild(ol)}
   (s.entries||[]).forEach(function(e){clBox.appendChild(entryEl(e))})});
  if(cl.more)clBox.appendChild(hintEl(tx('testplan.cl.more',{n:String(cl.more)+''})))}
 function listText(asCopy){if(!S.mod){say(clOut,'err',tx('testplan.needmod'));return}
  api(R+'checklist',body(),{what:tx('testplan.job.list')}).then(function(j){
   if(!asCopy){say(clOut,'ok',tx('testplan.cl.saved',{file:j.file}));return}
   var ok=function(){say(clOut,'ok',tx('testplan.cl.copied',{file:j.file}))},no=function(){say(clOut,'err',tx('testplan.cl.nocopy',{file:j.file}))};
   try{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(j.text).then(ok,no);else no()}catch(e){no()}},
   function(e){say(clOut,e&&e.cancelled?'hint':'err',errText(e))})}
 var copyBtn=el('button',{type:'button',text:tx('testplan.cl.copy'),onclick:function(){listText(true)}}),saveBtn=el('button',{type:'button',text:tx('testplan.cl.save'),onclick:function(){listText(false)}});
 var listCard=card('list',[blk('list.title',[el('h3',{text:tx('testplan.cl.h')})]),blk('list.intro',[hintEl(tx('testplan.cl.intro'))]),
  blk('list.counts',[clCounts],{name:tx('testplan.b.counts')}),h('div',{class:'row',blk:'list.btns','data-blkname':tx('testplan.b.btns')},[copyBtn,saveBtn]),
  blk('list.out',[clOut],{name:tx('testplan.b.out')}),blk('list.items',[clBox],{name:tx('testplan.b.list')})],{name:tx('testplan.cl.h')});

 // ---------- 5. mark as tested ----------
 var mkOut=el('div',{class:'hint'}),mkBtn=el('button',{type:'button',class:'primary',disabled:true,text:tx('testplan.mk.go'),onclick:function(){mark(false)}});
 function mark(asked){if(!S.mod){say(mkOut,'err',tx('testplan.needmod'));return}var s=sums();
  if(!asked&&(s.f>0||s.o>0)){askDo({title:tx('testplan.mk.go'),lines:[tx('testplan.mk.warn',{f:s.f,o:s.o}),tx('testplan.mk.ask'),tx('testplan.mk.askMore')],where:S.mod,danger:true}).then(function(y){if(y)mark(true)});return}
  api(R+'mark',{mod:S.mod},{what:tx('testplan.job.mark')}).then(function(j){say(mkOut,'ok',tx('testplan.mk.done',{at:when(j&&j.mark&&j.mark.at)}));spins=0;load({quiet:true})},
   function(e){say(mkOut,e&&e.cancelled?'hint':'err',errText(e))})}
 var markCard=card('mark',[blk('mark.title',[el('h3',{text:tx('testplan.mk.h')})]),blk('mark.intro',[hintEl(tx('testplan.mk.intro'))]),
  h('div',{class:'row',blk:'mark.btns','data-blkname':tx('testplan.b.btns')},[mkBtn]),blk('mark.out',[mkOut],{name:tx('testplan.b.out')})],{name:tx('testplan.mk.h')});

 // ---------- loading ----------
 function busy(on){[makeBtn,readBtn].forEach(function(b){b.disabled=!!on});mkBtn.disabled=!!on||!V}
 function setView(j,rowsOnly){var had=!!V;V=j;spins=0;busy(false);
  if(rowsOnly&&had){drawRows();return}
  drawChanges();drawRows();drawList();}
 function load(o){o=o||{};var my=++seq,md=S.mod||'';pollStop(poll);poll=null;
  needMod.hidden=!!md;
  if(!md){V=null;watching='';busy(false);chState.textContent='';drawChanges();drawRows();drawList();drawCmds(null);return}
  if(!o.quiet)say(chState,'hint',tx('testplan.ch.wait'));
  var b=body(filt());if(o.force)b.force=true;
  api(R+'plan',b,{what:tx('testplan.job.plan')}).then(function(j){if(my!==seq)return;
   if(j&&j.pending){if(++spins>20){busy(false);say(chState,'err',tx('testplan.e.spin'));return}watch(j.running||'plan');return}
   setView(j,o.rowsOnly)},function(e){if(my!==seq)return;busy(false);say(chState,e&&e.cancelled?'hint':'err',errText(e))})}
 function watch(verb){watching=verb;busy(true);pollStop(poll);poll=null;var md=S.mod||'',my=seq;
  api(R+'status?mod='+encodeURIComponent(md)).then(function(s){if(my!==seq||md!==(S.mod||''))return;var line=chState;
   if(s.running){say(line,'hint',tx('testplan.ch.secs',{s:s.secs,stage:s.stage&&known(s.stage)?tx(s.stage):tx('testplan.stage.plan')}));
    poll=pollLater('testplan',function(){watch(watching||s.verb)},1500);return}
   watching='';busy(false);
   if(s.state==='failed'){var m=s.key&&known(s.key)&&!/\{\w+\}/.test(tx(s.key))?tx(s.key):String(s.error||'');say(line,'err',m);return}
   if(s.state==='cancelled'){say(line,'hint',tx('testplan.ch.stopped'));return}
   load({quiet:true})},function(e){if(my!==seq)return;watching='';busy(false);say(chState,'err',errText(e))})}
 function loadState(){var md=S.mod||'';needGame.hidden=true;if(!md)return;
  api(R+'state?mod='+encodeURIComponent(md)).then(function(j){if(md!==(S.mod||''))return;needGame.hidden=!j.needsGame;
   if(!V){var m=j.lastMark;say(markLine,'hint',m?tx('testplan.ch.marked',{at:when(m.at),n:m.files==null?'?':m.files}):tx('testplan.ch.never'));
    var st=j.state||{};whereLine.hidden=!st.dir||(!!st.own&&!st.both);whereLine.textContent=!st.dir?'':st.both?tx('testplan.state.both',{dir:st.dir,other:st.other||''}):st.own?'':tx('testplan.state.other',{dir:st.dir})}},function(){})}

 root.appendChild(blk('title',[el('h2',{text:tx('testplan.title')})]));
 root.appendChild(blk('who',[hintEl(tx('testplan.who'))]));
 root.appendChild(blk('need',[needMod,needGame],{name:tx('testplan.b.state')}));
 [chgCard,rowsCard,runCardEl,listCard,markCard].forEach(function(c){root.appendChild(c)});
 needMod.hidden=!!S.mod;drawNa();

 function now(){return GID+'|'+(S.mod||'')}
 function fresh(){sig=now();V=null;Q.q='';Q.file='';qIn.value='';openRows={};spins=0;drawFile();drawNa();drawCmds(null);log.clear();drawChanges();drawRows();drawList();
  [runLine,clOut,mkOut].forEach(function(n){say(n,'hint','')});load();loadState()}
 function sync(){needMod.hidden=!!S.mod;if(!loaded)return;if(now()!==sig)fresh()}
 return {refresh:sync,focus:function(){if(!loaded){loaded=true;fresh()}else sync()}}
};
`;
