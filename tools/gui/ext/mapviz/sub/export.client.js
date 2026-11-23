// Map Viewer export part (MV-PG4c, page-pg4.md 7): the switch "Use as map previews" with its file list (the dry run:
// which files, their size and form, the picture, marks and layout, the stretch per axis, the safe-area warnings, backups
// and which file the game reads), per-target Advanced (picture, marks, layout, strong points and danger ticks naming
// their file, a map title, "use the picture on screen"), Write with one confirm, the run line with Cancel, Check, Undo
// last write with its own confirm, and the Editor shot button that shows the dry plan only (its confirm has Close only).
// One game branch only: what the server answers (the target rows, the editor plan). The AS64 build folder for the editor
// shot is typed by the user and kept in this browser's local storage only. Nothing here starts a job by itself: a Make
// button on a 404 need posts it on the user's press. The switch is off at every page open and never saved.
// Deploy all (late F11, at the top): "Write all previews into the mod" asks POST previews/deploy-list (every file this game
// reads for the map: file, size, format, new or replacing a mod file, the files it leaves out and why, the pictures to make)
// and shows it with the per-file picture, marks and layout (editable; remembered per game in this browser's local storage
// under mapviz.export.choices.<target>) and one confirm. Yes makes every missing picture (V.job, one after the other, at
// the long side the largest file needs), plans and writes with all:true (one journal entry), shows each file's progress
// and a summary (written, skipped with why, failed with why) and one "Undo this deploy" (POST previews/undo n). No mod
// folder: the button is off and the words say to choose a mod; writes go only into the page's mod folder.
// Author: Imperator_Aug (ARSENAL, ia-910f37b5)
module.exports = String.raw`
(function(){
if(!EXT_SCREENS.mapviz||!EXT_SCREENS.mapviz.parts)return;
EXT_SCREENS.mapviz.parts.push({id:'export',init:function(V){
 if(!V||V.q('rmt'))return;
 var TIDS=['preview','small','minimap','header','header_interface'];
 var SOURCES=['real','l0','l1','l2','l3','l4','topo','staff','painted','recon','sketch'];
 var BASES={topo:1,l0:1,l1:1,l2:1,l3:1,l4:1,staff:1,painted:1,recon:1,sketch:1,edshot:1};
 var MARKS=['none','flags','full'],PICSIZE=2048;
 var COMPOSE=['stretch','crop','backdrop','band'];
 var STAGES=['plan','compose','encode','commit'];
 var PRV=['PRV_MOD_MISSING','PRV_SOURCE_MISSING','PRV_NO_JOURNAL','PRV_WORKSHOP','PRV_GOH_PATH','PRV_GOH_WORKSHOP_ID','PRV_MOD_REFUSED','PRV_NOT_A_MOD',
  'PRV_PATH','PRV_CONFIRM','PRV_PLAN_CHANGED','PRV_SET','PRV_NO_FILE_IN_GAME','PRV_SP_GOH_ONLY','PRV_FALLBACK_SOURCE','PRV_STRONG_ON','PRV_DANGER_ON',
  'PRV_TITLE_GLYPHS','PRV_HEADER_WIDE','PRV_SCALEBAR_OFF','PRV_BAND_OUT','PRV_SAFE_TOP','PRV_SAFE_BOTTOM','PRV_SAFE_SIDE','PRV_GOH_DESK','PRV_STRONGER_FILE',
  'PRV_STRONGER_OTHER','PRV_NOT_IN_STACK','PRV_MOD_PAK','PRV_GOH_NO_MODINFO','PRV_UNDO_CHANGED','PRV_CHECK_CHANGED',
  'PRV_AS2_PATH','PRV_GOH_FOLDER_NAME','PRV_GOH_MODINFO_VERSION','PRV_GOH_ROOT_PAK','PRV_CROP_NO_ACTION','PRV_SAFE_NO_POINTS','PRV_MARKS_NOT_BUILT','PRV_LOCK',
  'PRV_SIZE','PRV_FILE_FAILED'];
 var ED=['EDSHOT_RUNNING','EDSHOT_FILE_PRESENT','EDSHOT_NOT_WRITABLE','EDSHOT_INSTANCE0','EDSHOT_NO_PROCESS_LIST','EDSHOT_EXE_ABSENT','EDSHOT_PROFILE_ABSENT',
  'EDSHOT_NO_INSTANCE','EDSHOT_UNLISTED','EDSHOT_MAYBE_UNWRITABLE','EDSHOT_RECORD','EDSHOT_NOT_OURS','EDSHOT_NOT_FILE','EDSHOT_TARGET_UNWRITABLE',
  'EDSHOT_TARGET_EXISTS','EDSHOT_SOURCE_LOCKED','EDSHOT_NO_ROOT'];
 // the editor of each target and whether the page must ask for its folder (the AS64 build folder has no lookup)
 var EDITOR={as64:'as64_ed',mowas2:'mowas_2_ed',goh:'goh_ed'},ASKROOT={as64:1},ROOTKEY='mapviz.export.edRoot';
 var st={on:false,targets:null,tKey:null,tErr:null,tWait:false,plan:null,pKey:null,pErr:null,need:null,needKey:null,pressed:null,busy:false,again:false,
  pWait:false,stale:0,set:{},title:'',pic:null,run:null,last:null,check:null,confirm:null,ed:null,edBusy:false,status:null,dep:null,setT:null};
 var el={};
 function has(a,x){return a.indexOf(x)>=0}
 function word(k,fb){var s=tx(k);return s===k?fb:s}
 function ctx(){return [V.q('target')||'',V.q('game')||'',V.q('mod')||'',V.q('map')||'',V.q('mode')||''].join('|')}
 function modName(){var m=V.q('mod');if(!m)return null;var p=String(m).split(/[\\/]+/).filter(function(s){return !!s});return p.length?p[p.length-1]:null}
 function prv(c,a){return has(PRV,c)?tx('mapviz.export.prv.'+c,a||{}):tx('mapviz.export.codeOther',{code:String(c)})}
 function edc(c){return has(ED,c)?tx('mapviz.export.ed.'+c):tx('mapviz.export.codeOther',{code:String(c)})}
 function tName(id){return word('mapviz.export.target.'+id,String(id))}
 function srcName(s){return s?word('mapviz.export.src.'+s,String(s)):''}
 function srcOf(r){var s=r&&r.source;if(s&&typeof s==='object')return s.name||s.resolved||'';return s||''}
 function stageText(s){return s&&has(STAGES,String(s))?tx('mapviz.export.stage.'+s):tx('mapviz.export.stage.other')}
 // a request stopped from the GUI job list (README JOBS): the plain word, not a failure line
 function errText(e){var p=e&&e.params||{},c=p.code;if(e&&e.cancelled)return String(e.text||e.message||tx('mapviz.export.cancelled'));if(c&&has(PRV,c))return prv(c,{name:'',file:'',px:''});if(c&&has(ED,c))return edc(c);
  if(e&&typeof e.key==='string'&&e.key.indexOf('mapviz.')===0)return tx(e.key,{msg:p.msg||''});return tx('mapviz.export.failed',{msg:e&&e.message||String(e)})}
 // the name of a request in the GUI job list: most are sent after another answer, where no clicked button names them
 function jw(k){return {what:tx('mapviz.export.title')+': '+tx(k)}}
 function say(k,a){st.status={k:k,a:a||{}};drawStatus()}
 function sayText(t){st.status={t:t};drawStatus()}
 function lsGet(){try{var s=window.localStorage;return s?(s.getItem(ROOTKEY)||''):''}catch(x){return ''}}
 function lsSet(v){try{var s=window.localStorage;if(s){if(v)s.setItem(ROOTKEY,v);else s.removeItem(ROOTKEY)}}catch(x){}}
 function n2(x){return (Math.round(x*100)/100).toFixed(2)}
 // ---- the per-file picture, marks and layout, remembered per game (this browser's local storage) ----
 var CHKEY='mapviz.export.choices.',CHRE=/^(preview|small|minimap|header|header_interface).(source|marks|compose)$/;
 function chOk(k,v){var m=CHRE.exec(k);if(!m||typeof v!=='string')return false;if(m[2]==='source')return has(SOURCES,v);if(m[2]==='marks')return has(MARKS,v);return has(COMPOSE,v)&&canCompose(m[1],v)}
 function chLoad(t){var r={};try{var s=window.localStorage,v=s&&t?s.getItem(CHKEY+t):null,o=v?JSON.parse(v):null;
   if(o&&typeof o==='object')for(var k in o)if(Object.prototype.hasOwnProperty.call(o,k)&&chOk(k,o[k]))r[k]=o[k]}catch(x){}return r}
 function chSave(t){if(!t)return;try{var s=window.localStorage,o={},n=0;for(var k in st.set)if(Object.prototype.hasOwnProperty.call(st.set,k)&&chOk(k,st.set[k])){o[k]=st.set[k];n++}
   if(s){if(n)s.setItem(CHKEY+t,JSON.stringify(o));else s.removeItem(CHKEY+t)}}catch(x){}}
 // another game: its own remembered choices replace the picture, marks and layout keys (ticks and the title stay)
 function chUse(t){if(st.setT===t)return;st.setT=t;var k;for(k in st.set)if(Object.prototype.hasOwnProperty.call(st.set,k)&&CHRE.test(k))delete st.set[k];
  var c=chLoad(t);for(k in c)if(Object.prototype.hasOwnProperty.call(c,k))st.set[k]=c[k]}
 function stretchText(sv){if(!sv||typeof sv.ratio!=='number'||!(sv.ratio>0))return null;var r=sv.ratio,ax=r>=1?r:1,ay=r>=1?1:1/r;
  return tx('mapviz.export.stretch',{ax:n2(ax),ay:n2(ay)})}
 // ---- jobs of the page (the base part's fits()/runText() rule, R25) ----
 function fits(ja,na){ja=ja||{};for(var k in na||{}){if(!Object.prototype.hasOwnProperty.call(na,k)||na[k]==null)continue;var v=ja[k];
   if(k==='map'){if(v!=null&&String(v)!==String(na[k]))return false;continue}if(v==null||String(v)!==String(na[k]))return false}return true}
 function runText(need){var js=V.q('jobs')||[];for(var i=0;i<js.length;i++){var j=js[i];if(j&&j.what===need.what&&j.target===V.q('target')&&(!j.map||j.map===V.q('map'))&&fits(j.args,need.args))return j.text||tx('mapviz.export.making')}return null}
 // ---- request bodies (POST: the page adds nothing, so the part sends the common fields itself) ----
 function body0(){var b={target:V.q('target'),map:V.q('map'),mod:V.q('mod')},g=V.q('game'),m=V.q('mode');if(g)b.game=g;if(V.q('mod'))b.modDirs=[V.q('mod')];if(m)b.mode=m;return b}
 function planBody(){var b=body0(),s={},n=0,k,strong=false;for(k in st.set)if(Object.prototype.hasOwnProperty.call(st.set,k)){s[k]=st.set[k];n++;if(/\.(strong|danger)$/.test(k))strong=true}
  if(n)b.set=s;if(st.title)b.title=st.title;return b}
 // ---- the target rows: GET previews/targets (switch off) ----
 function loadTargets(){var k=ctx();if(!V.q('target')||!V.q('map')){st.targets=null;st.tKey=null;draw();return}
  if(V.q('docBusy')){st.tWait=true;return}st.tWait=false;if(st.tKey===k&&(st.targets||st.tAsk))return;st.tKey=k;st.tAsk=true;st.tErr=null;
  var q={};// the shell adds target, game, modDir, map and mode (QCOM 'previews/targets')
  V.api('GET','previews/targets',q,jw('mapviz.export.reading')).then(function(r){if(st.tKey!==k)return;st.tAsk=false;st.stale=0;st.targets=r&&Array.isArray(r.rows)?r:null;if(!st.targets)st.tErr={nb:false,bad:true};draw()},
   function(e){if(st.tKey!==k)return;st.tAsk=false;if(e&&e.stale){st.tKey=null;if(st.stale++<1)loadTargets();return}st.tErr={nb:e&&e.status===501,e:e};draw()})}
 // ---- the plan: POST previews/plan (switch on); one request at a time, a newer one wins ----
 function askPlan(){if(!st.on||!V.q('mod')||!V.q('map')||!V.q('target'))return;if(V.q('docBusy')){st.pWait=true;return}st.pWait=false;
  if(st.busy){st.again=true;return}st.busy=true;st.again=false;var k=ctx();
  V.api('POST','previews/plan',planBody(),jw('mapviz.export.planning')).then(function(r){st.busy=false;if(st.again||ctx()!==k||!st.on){if(st.on)askPlan();return}st.stale=0;
    if(!r||!Array.isArray(r.targets)||typeof r.hash!=='string'){st.plan=null;st.pErr={bad:true};draw();return}
    st.plan=r;st.pKey=k;st.need=null;st.pErr=null;draw()},
   function(e){st.busy=false;if(st.again||ctx()!==k||!st.on){if(st.on)askPlan();return}
    if(e&&e.stale){if(st.stale++<1)askPlan();return}
    var nd=e&&e.params&&e.params.need;st.plan=null;if(nd&&nd.what){st.need=nd;st.needKey=k;st.pErr=null}else{st.need=null;st.pErr={nb:e&&e.status===501,e:e}}draw()})}
 function make(){var nd=st.need;if(!nd)return;var sig=st.needKey+'|'+JSON.stringify(nd);if(st.pressed===sig||runText(nd))return;st.pressed=sig;draw();
  var p;try{p=V.job(nd.what,nd.args||{})}catch(x){p=null}
  if(p&&p.then)p.then(function(){st.pressed=null;draw()},function(e){st.pressed=null;say('mapviz.export.makeFailed',{msg:errText(e)});draw()});else st.pressed=null}
 // ---- write, run line, check, undo ----
 function running(){return !!(st.run&&(st.run.state==='posting'||st.run.state==='running'))}
 function askWrite(){var p=st.plan;if(!p||running()||!V.q('mod'))return;var files=Array.isArray(p.files)?p.files:[];
  st.confirm={kind:'write',plan:p,text:tx('mapviz.export.confirm',{n:files.length,mod:modName()||''}),list:files};draw()}
 function doWrite(){var c=st.confirm;if(!c||c.kind!=='write'||running())return;var p=c.plan;st.confirm=null;
  var b=planBody();b.planHash=p.hash;var run={id:null,what:'write',map:V.q('map'),state:'posting'};st.run=run;draw();
  V.api('POST','previews/write',b,jw('mapviz.export.writing')).then(function(r){if(!r||!r.id){run.state='failed';say('mapviz.export.failed',{msg:''});draw();return}run.id=r.id;run.state='running';draw();poll(run)},
   function(e){run.state='failed';sayText(errText(e));if(e&&e.params&&e.params.code==='PRV_PLAN_CHANGED'){st.plan=null;askPlan()}draw()})}
 // the read of a running write waits while the Map Viewer page or the window is hidden (pollLater, page.js): one read when it is seen again
 function pollIn(f,ms){if(typeof pollLater==='function')pollLater(typeof S!=='undefined'&&S&&S.sec&&S.sec.mapviz?'mapviz':'',f,ms);else setTimeout(f,ms)}
 function poll(run){var errs=0;function step(){if(run.state!=='running')return;V.api('GET','previews/run',{id:run.id}).then(function(r){errs=0;r=r||{};run.r=r;
   if(r.state==='done'){run.state='done';ended(run,r);return}
   if(r.state==='failed'||r.state==='cancelled'||r.state==='timeout'){run.state=r.state==='cancelled'?'cancelled':'failed';ended(run,r);return}
   drawRun();drawDeploy();pollIn(step,500)},function(e){if(run.state!=='running')return;if(e&&e.stale){pollIn(step,500);return}var s=e&&e.status;
   if(!(s>=400&&s<500)&&++errs<=3){pollIn(step,1000);return}run.state='failed';sayText(errText(e));draw()})}
  step()}
 function count(v){return Array.isArray(v)?v.length:typeof v==='number'?v:0}
 // the write number: entry.n (previews.md P3) or the top-level n (the previews CLI as built)
 function writeN(res){var n=res&&res.entry&&res.entry.n;if(n==null&&res)n=res.n;return typeof n==='number'?n:null}
 // notes: a list of codes or {code, text} (P3), or an object of target id -> [code] (the CLI as built); one line per code
 function noteCodes(v){var out=[],add=function(x){var c=typeof x==='string'?x:x&&x.code;if(typeof c==='string'&&c&&out.indexOf(c)<0)out.push(c)};
  if(Array.isArray(v))v.forEach(add);else if(v&&typeof v==='object')for(var k in v)if(Object.prototype.hasOwnProperty.call(v,k)){if(Array.isArray(v[k]))v[k].forEach(add);else add(v[k])}
  return out}
 function ended(run,r){var mine=run.map===V.q('map'),pre=mine?'':tx('mapviz.export.otherMap',{map:String(run.map||'')})+' ';
  if(run.state==='done'){var res=r.result||{};
   if(run.what==='write'){st.last=res;var n=writeN(res);sayText(pre+tx('mapviz.export.written',{n:count(res.written),b:count(res.backups),w:n==null?'?':n}))}
   else if(run.what==='deploy'){if(writeN(res)!=null)st.last=res;var dn=writeN(res);if(run.dep){run.dep.state='done';run.dep.res=res}
    sayText(pre+tx('mapviz.export.deployDone',{w:count(res.written),s:count(res.skipped),f:count(res.failed),n:dn==null?'?':dn}))}
   else sayText(pre+tx('mapviz.export.undone',{n:count(res.restored),k:count(res.kept)}));
   run.notes=noteCodes(res.notes);
   if(mine&&st.on){st.plan=null;askPlan()}}
  else if(run.state==='cancelled'){var fe=r.error||{};sayText(pre+tx(fe.forced?'mapviz.export.cancelledForce':'mapviz.export.cancelled'));if(run.dep){run.dep.state='failed';run.dep.err=st.status.t}if(fe.forced&&mine&&st.on){st.plan=null;askPlan()}}
  else{var e=r.error||{},c=e.code||'MV_FAULT';sayText(pre+(has(PRV,c)?prv(c,{name:'',file:'',px:''}):tx('mapviz.err.'+(/^MV_[A-Z_]+$/.test(c)?c:'MV_FAULT'),{msg:e.msg||''})));
   if(run.dep){run.dep.state='failed';run.dep.err=st.status.t}
   if(c==='PRV_PLAN_CHANGED'&&mine&&st.on){st.plan=null;askPlan()}}
  draw()}
 function cancelRun(){var run=st.run;if(!run||run.state!=='running'||!run.id||run.cancelAsked)return;run.cancelAsked=true;drawRun();
  V.api('POST','previews/cancel',{id:run.id},jw('mapviz.export.stopping')).then(function(){},function(e){sayText(errText(e))})}
 function doCheck(){if(!V.q('mod')||!V.q('map')||st.checking)return;st.checking=true;st.check=null;drawRun();
  V.api('POST','previews/check',body0(),jw('mapviz.export.checking')).then(function(r){st.checking=false;st.check=r||null;draw()},function(e){st.checking=false;st.check=null;sayText(errText(e));draw()})}
 function askUndo(){if(running()||!V.q('mod')||!V.q('map'))return;var n=writeN(st.last);
  st.confirm={kind:'undo',n:n==null?null:n,text:n==null?tx('mapviz.export.undoLast'):tx('mapviz.export.undoConfirm',{n:n}),list:[]};draw()}
 function doUndo(){var c=st.confirm;if(!c||c.kind!=='undo'||running())return;st.confirm=null;var b=body0();b.confirm=true;if(c.n!=null)b.n=c.n;
  var run={id:null,what:'undo',map:V.q('map'),state:'posting'};st.run=run;draw();
  V.api('POST','previews/undo',b,jw('mapviz.export.undoing')).then(function(r){r=r||{};if(r.id){run.id=r.id;run.state='running';draw();poll(run);return}
   if(Array.isArray(r.restored)||Array.isArray(r.kept)){run.state='done';ended(run,{state:'done',result:r});return}run.state='failed';say('mapviz.export.failed',{msg:''});draw()},
   function(e){run.state='failed';sayText(errText(e));draw()})}
 // ---- editor shot: the dry plan ----
 function edPlan(){var t=V.q('target');if(!t||!V.q('map')||st.edBusy)return;var b={target:t,map:V.q('map')},g=V.q('game');
  if(ASKROOT[t]){var r=el.edRoot?String(el.edRoot.value||'').trim():'';lsSet(r);
   if(!r){st.ed={v:1,target:t,map:V.q('map'),editor:EDITOR[t],refuse:['EDSHOT_NO_ROOT'],notes:[],ok:false,starts:false,local:true};st.edCtx=ctx();st.confirm=null;draw();return}b.root=r}
  else if(g)b.game=g;
  st.edBusy=true;drawEd();var k=ctx();
  V.api('POST','edshot/plan',b,{what:tx('mapviz.export.edBtn')}).then(function(r){st.edBusy=false;if(ctx()!==k){draw();return}if(!r||typeof r!=='object'||!r.editor){st.ed=null;say('mapviz.export.failed',{msg:''});draw();return}
    st.ed=r;st.edCtx=k;st.confirm={kind:'ed',plan:r,text:edText(r),list:[]};draw()},function(e){st.edBusy=false;st.ed=null;sayText(errText(e));draw()})}
 function edText(p){var s=Array.isArray(p.secs)?p.secs:[];
  return tx('mapviz.export.edConfirm',{editor:word('mapviz.export.editor.'+p.editor,String(p.editor)),folder:String(p.root||''),map:String(p.map||''),size:p.size==null?'':p.size,
   files:(Array.isArray(p.files)?p.files:[]).join(', '),profile:word('mapviz.export.prof.'+(p.profile&&p.profile.kind),''),lo:s[0]==null?'?':s[0],hi:s[1]==null?'?':s[1]})}
 // ---- deploy all: the list, one confirm, the pictures, one write of every file, the summary, one undo ----
 function depBusy(){var d=st.dep;return !!d&&(d.state==='listing'||d.state==='making'||d.state==='planning'||d.state==='writing')}
 function deployList(){if(!V.q('mod')||!V.q('map')||!V.q('target')||running())return;var o=st.dep;if(o&&depBusy()&&o.state!=='listing')return;
  var k=ctx(),d={k:k,state:'listing',list:o&&o.k===k?o.list:null,err:null};st.dep=d;st.confirm=null;draw();
  V.api('POST','previews/deploy-list',planBody(),jw('mapviz.export.deployListing')).then(function(r){if(st.dep!==d)return;if(ctx()!==k){st.dep=null;draw();return}
    if(!r||!Array.isArray(r.files)||!Array.isArray(r.skipped)){d.state='failed';d.err=tx('mapviz.export.badAnswer');draw();return}
    d.list=r;d.state='confirm';draw()},
   function(e){if(st.dep!==d)return;d.state='failed';d.err=errText(e);draw()})}
 function deployGo(){var d=st.dep;if(!d||d.state!=='confirm'||!d.list||running()||ctx()!==d.k||!V.q('mod'))return;var L=d.list;
  var needs=(Array.isArray(L.needs)?L.needs:[]).filter(function(n){return n&&typeof n.what==='string'&&n.what});
  if(!L.files.length){d.state='failed';d.err=tx('mapviz.export.deployNothing');draw();return}
  d.state='making';d.n=needs.length;d.i=0;d.jobErr=[];draw();
  function fail(m){if(st.dep!==d)return;d.state='failed';d.err=m;draw()}
  function next(){if(st.dep!==d)return;if(d.i>=needs.length){planAll();return}var nd=needs[d.i];d.what=nd.what;drawDeploy();
   var p;try{p=V.job(nd.what,nd.args||{})}catch(x){p=null}
   if(!p||typeof p.then!=='function'){d.jobErr.push({what:nd.what,msg:''});d.i++;next();return}
   p.then(function(){d.i++;next()},function(e){d.jobErr.push({what:nd.what,msg:errText(e)});d.i++;next()})}
  function planAll(){d.state='planning';drawDeploy();var b=planBody();b.all=true;
   V.api('POST','previews/plan',b,jw('mapviz.export.deployPlanning')).then(function(r){if(st.dep!==d)return;if(!r||typeof r.hash!=='string'){fail(tx('mapviz.export.badAnswer'));return}
     var w=planBody();w.all=true;w.planHash=r.hash;var run={id:null,what:'deploy',map:V.q('map'),state:'posting',dep:d};d.state='writing';d.run=run;st.run=run;draw();
     V.api('POST','previews/write',w,jw('mapviz.export.writing')).then(function(x){if(!x||!x.id){run.state='failed';fail(tx('mapviz.export.badAnswer'));return}run.id=x.id;run.state='running';draw();poll(run)},
      function(e){run.state='failed';fail(errText(e))})},
    function(e){if(e&&e.cancelled){if(st.dep!==d)return;d.state='confirm';sayText(errText(e));draw();return}fail(errText(e))})}
  next()}
 function deployUndo(){var d=st.dep,n=d&&d.res?writeN(d.res):null;if(n==null||running())return;
  st.confirm={kind:'undo',n:n,text:tx('mapviz.export.deployUndoConfirm',{n:n}),list:[]};draw()}
 function inIds(v,id){return Array.isArray(v)&&v.some(function(x){return x&&x.id===id})}
 function whyOf(x){var c=x&&x.code;return c&&has(PRV,c)?prv(c,{file:String(x.path||''),name:'',px:''}):String(x&&(x.why||c)||'')}
 // a file's state in the deploy: the result when it ended, else the run's stage and count (the files go in list order)
 function fState(d,i,f){var r=d.res;if(r){if(inIds(r.failed,f.id))return 'failed';if(inIds(r.skipped,f.id))return 'skipped';
   return (Array.isArray(r.written)?r.written:[]).some(function(p){return p===f.path||String(p).replace(/\\/g,'/').slice(-f.path.length)===f.path})?'written':'skipped'}
  var rr=d.state==='writing'&&d.run&&d.run.r,sg=rr&&rr.stage,n=rr&&rr.done||0;
  if(sg==='compose')return i<n?'composed':i===n?'compose':'wait';if(sg==='encode')return i<n?'encoded':'composed';if(sg==='commit')return 'encoded';
  return d.state==='making'||d.state==='planning'||d.state==='writing'?'wait':null}
 function drawDeploy(){var box=el.dep;if(!box)return;box.textContent='';var mod=V.q('mod'),map=V.q('map'),d=st.dep&&st.dep.k===ctx()?st.dep:null;
  if(el.depBtn)el.depBtn.disabled=!(mod&&map&&V.q('target'))||running()||depBusy();
  if(!map){line(box,tx('mapviz.export.deployNoMap'),'hint');return}
  if(!mod){line(box,tx('mapviz.export.deployNoMod'),'hint');return}
  if(!d){line(box,tx('mapviz.export.deployT'),'hint');return}
  var L=d.list;
  if(d.state==='listing'&&!L){line(box,tx('mapviz.export.deployListing'),'hint');return}
  if(d.state==='failed'&&!L){line(box,tx('mapviz.export.deployFailed',{msg:d.err||''}));return}
  var card=h('div',{'class':'card'});box.appendChild(card);
  line(card,tx('mapviz.export.deployHead',{n:L.files.length,mod:modName()||''}));
  if(!L.files.length)line(card,tx('mapviz.export.deployNothing'),'hint');
  L.files.forEach(function(f,i){if(!f||!has(TIDS,f.id))return;var it=h('div',{'class':'row','data-file':f.id}),fs=fState(d,i,f);
   line(it,tx('mapviz.export.deployFile',{name:tName(f.id),file:String(f.path||''),size:sizeText(f.size),format:String(f.format||''),action:tx(f.action==='replace'?'mapviz.export.action.replace':'mapviz.export.action.new')})+(fs?' '+tx('mapviz.export.fstate.'+fs):''));
   if(f.problem&&!d.res)line(it,prv(String(f.problem),{file:String(f.file||''),name:'',px:''}),'hint');
   if(d.res&&fs==='failed')(d.res.failed||[]).forEach(function(x){if(x&&x.id===f.id)line(it,whyOf(x),'hint')});
   if(d.res&&fs==='skipped')(d.res.skipped||[]).forEach(function(x){if(x&&x.id===f.id)line(it,whyOf(x),'hint')});
   if(d.state==='confirm'){var lab=function(k,ctl){return h('label',{'class':'f'},[h('span',{'class':'n',text:tx(k)}),ctl,h('span')])},id=f.id;
    it.appendChild(lab('mapviz.export.advSource',sel(SOURCES,has(SOURCES,f.source)?f.source:'real',srcName,function(v){setKey(id,'source',v,null)},tx('mapviz.export.advSource'))));
    it.appendChild(lab('mapviz.export.advMarks',sel(MARKS,has(MARKS,f.marks)?f.marks:'none',function(v){return tx('mapviz.export.marks.'+v)},function(v){setKey(id,'marks',v,null)},tx('mapviz.export.advMarks'))));
    it.appendChild(lab('mapviz.export.advCompose',sel(COMPOSE,has(COMPOSE,f.compose)?f.compose:'stretch',function(v){return tx('mapviz.export.compose.'+v)},function(v){setKey(id,'compose',v,null)},tx('mapviz.export.advCompose'),function(v){return !canCompose(id,v)})))}
   card.appendChild(it)});
  L.skipped.forEach(function(x){if(x&&has(TIDS,x.id))line(card,tx('mapviz.export.deploySkip',{name:tName(x.id),file:String(x.path||''),why:prv(String(x.why||'PRV_NO_FILE_IN_GAME'),{file:String(x.file||''),name:'',px:''})}),'hint')});
  if(d.state==='confirm'||d.state==='listing'){if(Array.isArray(L.needs)&&L.needs.length)line(card,tx('mapviz.export.deployNeeds',{n:L.needs.length,px:L.size==null?'?':L.size}),'hint');
   if(d.state==='listing'){line(card,tx('mapviz.export.deployListing'),'hint');return}
   card.appendChild(h('button',{type:'button',text:tx('mapviz.export.deployYes'),onclick:function(){deployGo()}}));
   card.appendChild(h('button',{type:'button',text:tx('mapviz.export.no'),onclick:function(){st.dep=null;draw()}}));return}
  if(d.state==='making')line(card,tx('mapviz.export.deployMaking',{i:Math.min(d.i+1,d.n),n:d.n,what:word('mapviz.export.what.'+d.what,String(d.what||''))}),'hint');
  if(d.state==='planning')line(card,tx('mapviz.export.deployPlanning'),'hint');
  (d.jobErr||[]).forEach(function(j){line(card,tx('mapviz.export.deployMakeFailed',{what:word('mapviz.export.what.'+j.what,String(j.what)),msg:j.msg}),'hint')});
  if(d.state==='failed')line(card,tx('mapviz.export.deployFailed',{msg:d.err||''}));
  if(d.state==='done'&&d.res){var r=d.res;line(card,tx('mapviz.export.deployDone',{w:count(r.written),s:count(r.skipped),f:count(r.failed),n:writeN(r)==null?'?':writeN(r)}));
   if(writeN(r)!=null)card.appendChild(h('button',{type:'button',text:tx('mapviz.export.deployUndo'),title:tx('mapviz.export.deployUndoT'),disabled:running()?true:null,onclick:function(){deployUndo()}}))}}
 // ---- the panel ----
 function line(box,text,cls){box.appendChild(h('p',{'class':cls||null,text:text}));return box}
 function rowsNow(){if(st.plan)return st.plan.targets.filter(function(r){return r&&has(TIDS,r.id)});return st.targets?st.targets.rows.filter(function(r){return r&&has(TIDS,r.id)}):[]}
 function sizeText(sz){return Array.isArray(sz)&&sz.length===2?sz[0]+' x '+sz[1]:sz&&typeof sz==='object'&&sz.w?sz.w+' x '+sz.h:''}
 function lobbyId(rows){var s=null,hd=null;rows.forEach(function(r){if(r.id==='small'&&r.state!=='none')s=r;if(r.id==='header'&&r.state!=='none')hd=r});return s?'small':hd?'header':null}
 function drawFiles(){var box=el.files;if(!box)return;box.textContent='';var map=V.q('map');
  if(!map){line(box,tx('mapviz.export.noMap'),'hint');return}
  if(st.on&&st.need){var t=runText(st.need);line(box,tx('mapviz.export.need',{what:word('mapviz.export.what.'+st.need.what,String(st.need.what))}));
   if(t)line(box,t,'hint');else box.appendChild(h('button',{type:'button',text:tx('mapviz.export.make'),title:tx('mapviz.export.makeT'),disabled:st.pressed?true:null,onclick:function(){make()}}));return}
  var err=st.on?st.pErr:st.tErr;
  if(err&&err.nb){line(box,tx('mapviz.export.notBuilt'),'hint');return}
  if(err&&err.bad){line(box,tx('mapviz.export.badAnswer'),'hint');return}
  if(err&&err.e){line(box,errText(err.e),'hint');if(!rowsNow().length)return}
  var rows=rowsNow();if(!rows.length){if(st.on&&st.busy)line(box,tx('mapviz.export.planning'),'hint');else if(!st.on&&st.tAsk)line(box,tx('mapviz.export.reading'),'hint');return}
  line(box,tx(st.plan?'mapviz.export.planHead':'mapviz.export.gameHead'));
  var lobby=lobbyId(rows),key=String(map);
  rows.forEach(function(r){var it=h('div',{'class':'card'});var none=r.state==='none';
   line(it,tx('mapviz.export.rowHead',{name:tName(r.id),file:typeof r.path==='string'&&r.path?r.path:'resource/map/'+key+'/'+String(r.file||''),state:word('mapviz.export.state.'+r.state,String(r.state||''))}));
   if(none){if(r.why)line(it,prv(r.why,{file:String(r.file||''),name:'',px:''}),'hint');box.appendChild(it);return}
   if(r.id==='preview')line(it,tx('mapviz.export.loading'),'hint');
   if(r.id===lobby)line(it,tx('mapviz.export.lobby'),'hint');
   var sz=sizeText(r.size);if(sz)line(it,tx('mapviz.export.facts',{size:sz,format:String(r.format||''),mips:r.mips==null?'?':r.mips}));
   line(it,tx('mapviz.export.picture',{source:srcName(srcOf(r)),marks:word('mapviz.export.marks.'+r.marks,String(r.marks||'')),compose:word('mapviz.export.compose.'+r.compose,String(r.compose||''))}));
   var sx=stretchText(r.stretch);if(sx)line(it,sx);if(r.stretch&&r.stretch.scaleBar===false)line(it,tx('mapviz.export.noScaleBar'),'hint');
   var ex=r.existing||{};if(ex.backup==='new')line(it,tx('mapviz.export.backupNew'),'hint');else if(ex.backup==='kept')line(it,tx('mapviz.export.backupKept'),'hint');
   if(r.winner&&typeof r.winner==='object'){if(r.winner.ours)line(it,tx('mapviz.export.winOurs'),'hint');else line(it,tx('mapviz.export.winOther',{file:String(r.winner.file||'')}),'hint')}
   if(r.tag==='T')line(it,tx('mapviz.export.tagT'),'hint');else if(r.tag==='I')line(it,tx('mapviz.export.tagI'),'hint');
   if(r.state==='off')line(it,tx('mapviz.export.offT'),'hint');
   (Array.isArray(r.notes)?r.notes:[]).forEach(function(c){if(typeof c==='string')line(it,prv(c,{file:String(r.file||''),name:'',px:''}),'hint')});
   box.appendChild(it)});
  if(st.plan&&Array.isArray(st.plan.notes))st.plan.notes.forEach(function(n){var c=n&&(n.code||n);if(typeof c==='string')line(box,prv(c,{file:'',name:'',px:''}),'hint')})}
 function drawWarn(){var box=el.warn;if(!box)return;box.textContent='';if(!st.plan)return;var any=false;
  st.plan.targets.forEach(function(r){if(!r||!has(TIDS,r.id)||r.state!=='write')return;(Array.isArray(r.warnings)?r.warnings:[]).forEach(function(w){if(!w||typeof w.code!=='string')return;any=true;
   var px=Array.isArray(w.px)?Math.round(w.px[0])+', '+Math.round(w.px[1]):'';line(box,prv(w.code,{name:String(w.name||''),file:String(r.file||''),px:px}))})});
  if(!any)line(box,tx('mapviz.export.noWarn'),'hint')}
 function sel(list,val,words,fn,label,off){var s=h('select',{'aria-label':label,onchange:function(){fn(s.value)}});
  list.forEach(function(v){var o=h('option',{value:v,text:words(v)});if(off&&off(v))o.disabled=true;s.appendChild(o)});if(val)s.value=val;return s}
 function canCompose(id,c){if(id==='minimap')return c==='stretch';if(c==='band')return id==='header';return true}
 function setKey(id,k,v,dflt){var key=id+'.'+k;if(v==null||v===''||v===dflt)delete st.set[key];else st.set[key]=v;if(CHRE.test(key))chSave(V.q('target'));askPlan();
  if(st.dep&&st.dep.state==='confirm')deployList();draw()}
 function drawAdv(){var box=el.advBody;if(!box)return;box.textContent='';var rows=rowsNow().filter(function(r){return r.state!=='none'});
  if(!st.on){line(box,tx('mapviz.export.advOff'),'hint');return}
  if(!rows.length){line(box,tx('mapviz.export.advNone'),'hint');return}
  rows.forEach(function(r){var id=r.id,f=String(r.file||''),d=h('div',{'class':'card'});d.appendChild(h('h4',{text:tName(id)}));
   var src=st.set[id+'.source']||srcOf(r)||'real',mk=st.set[id+'.marks']||r.marks||'none',cp=st.set[id+'.compose']||r.compose||'stretch';
   var lab=function(k,ctl){return h('label',{'class':'f'},[h('span',{'class':'n',text:tx(k)}),ctl,h('span')])};
   d.appendChild(lab('mapviz.export.advSource',sel(SOURCES,has(SOURCES,src)?src:'real',srcName,function(v){setKey(id,'source',v,null)},tx('mapviz.export.advSource'))));
   d.appendChild(lab('mapviz.export.advMarks',sel(MARKS,mk,function(v){return tx('mapviz.export.marks.'+v)},function(v){setKey(id,'marks',v,null)},tx('mapviz.export.advMarks'))));
   d.appendChild(lab('mapviz.export.advCompose',sel(COMPOSE,cp,function(v){return tx('mapviz.export.compose.'+v)},function(v){setKey(id,'compose',v,null)},tx('mapviz.export.advCompose'),function(v){return !canCompose(id,v)})));
   ['strong','danger'].forEach(function(k){var on=st.set[id+'.'+k]==='1'||st.set[id+'.'+k]===1;var cb=h('input',{type:'checkbox',onchange:function(){setKey(id,k,cb.checked?'1':null,null)}});cb.checked=on;
    d.appendChild(h('label',{'class':'f'},[cb,h('span',{text:tx(k==='strong'?'mapviz.export.strongT':'mapviz.export.dangerT',{file:f})})]))});
   box.appendChild(d)})}
 function drawRun(){var box=el.runLine;if(!box)return;box.textContent='';var run=st.run;
  if(el.write)el.write.disabled=!(st.on&&st.plan&&!running()&&V.q('mod'));
  if(el.check)el.check.disabled=!(V.q('mod')&&V.q('map')&&!st.checking&&!running());
  if(el.undo)el.undo.disabled=!(V.q('mod')&&V.q('map')&&!running());
  if(run&&(run.state==='running'||run.state==='posting')){var r=run.r||{},t=tx(run.what==='undo'?'mapviz.export.undoing':'mapviz.export.writing');
   if(run.map!==V.q('map'))t=tx('mapviz.export.otherMap',{map:String(run.map||'')})+' '+t;
   t=t+' '+stageText(r.stage);if(r.total)t=t+' '+tx('mapviz.export.progress',{done:r.done||0,total:r.total});if(r.elapsed)t=t+' '+tx('mapviz.export.elapsed',{s:r.elapsed});
   line(box,t);if(run.cancelAsked)line(box,tx('mapviz.export.stopping'),'hint');
   else if(run.id)box.appendChild(h('button',{type:'button',text:tx('mapviz.export.cancel'),onclick:function(){cancelRun()}}))}
  if(run&&run.state==='done'&&run.notes&&run.notes.length)run.notes.forEach(function(c){line(box,prv(c,{file:'',name:'',px:''}),'hint')});
  if(st.checking)line(box,tx('mapviz.export.checking'),'hint');
  var ck=st.check;if(ck&&Array.isArray(ck.files)){if(ck.ok)line(box,tx('mapviz.export.checkOk',{n:ck.files.length}));
   ck.files.forEach(function(f){if(!f||f.ok)return;var ns=(Array.isArray(f.notes)?f.notes:[]).map(function(c){return prv(c,{file:String(f.path||''),name:'',px:''})});
    line(box,tx('mapviz.export.checkBad',{file:String(f.path||''),why:ns.join(' ')||tx('mapviz.export.checkFail')}))})}}
 function drawStatus(){var box=el.status;if(!box)return;var s=st.status;box.textContent=s?(s.t!=null?s.t:tx(s.k,s.a)):''}
 function drawConfirm(){var box=el.confirm;if(!box)return;box.textContent='';var c=st.confirm;box.hidden=!c;if(!c)return;
  line(box,c.text);if(c.list&&c.list.length){var ul=h('ul');c.list.forEach(function(f){ul.appendChild(h('li',{text:String(f)}))});box.appendChild(ul)}
  if(c.kind==='ed'){var p=c.plan||{};if(p.profile&&p.profile.yes===false)line(box,tx('mapviz.export.edYes'),'hint');
   if(Array.isArray(p.routes)&&has(p.routes,'console'))line(box,tx('mapviz.export.edConsole'),'hint');
   box.appendChild(h('button',{type:'button',text:tx('mapviz.export.close'),onclick:function(){st.confirm=null;draw()}}));return}
  box.appendChild(h('button',{type:'button',text:tx('mapviz.export.yes'),onclick:function(){if(c.kind==='write')doWrite();else doUndo()}}));
  box.appendChild(h('button',{type:'button',text:tx('mapviz.export.no'),onclick:function(){st.confirm=null;draw()}}))}
 function drawEd(){var box=el.edPlan;if(!box)return;box.textContent='';var t=V.q('target');
  if(el.edRootBox)el.edRootBox.hidden=!ASKROOT[t];if(el.edBtn)el.edBtn.disabled=!(t&&V.q('map'))||st.edBusy;
  if(st.edBusy){line(box,tx('mapviz.export.edReading'),'hint');return}var p=st.ed;if(!p)return;
  line(box,tx('mapviz.export.edHead',{editor:word('mapviz.export.editor.'+p.editor,String(p.editor||''))}));
  if(p.exe)line(box,tx('mapviz.export.edExe',{exe:String(p.exe)}));
  (Array.isArray(p.refuse)?p.refuse:[]).forEach(function(c){line(box,tx('mapviz.export.edRefuse',{why:edc(c)}))});
  (Array.isArray(p.notes)?p.notes:[]).forEach(function(c){if(typeof c==='string')line(box,edc(c),'hint')});
  if(!p.local)line(box,tx('mapviz.export.edDry'),'hint')}
 function drawTop(){var on=!!(V.q('mod')&&V.q('map'));if(el.sw){el.sw.disabled=!on;el.sw.checked=st.on}
  if(el.mod){var n=modName();el.mod.textContent=n?tx('mapviz.export.mod',{name:n}):tx('mapviz.export.noMod')}
  if(el.pic)el.pic.disabled=!(st.on&&st.pic&&has(SOURCES,st.pic));if(el.title&&el.title.value!==st.title)el.title.value=st.title}
 function draw(){drawTop();drawDeploy();drawFiles();drawAdv();drawWarn();drawRun();drawConfirm();drawEd();drawStatus()}
 function usePic(){var p=st.pic;if(!st.on||!p||!has(SOURCES,p))return;rowsNow().forEach(function(r){if(r.state!=='none')st.set[r.id+'.source']=p});chSave(V.q('target'));
  say('mapviz.export.picUsed',{name:srcName(p)});askPlan();draw()}
 V.addPanel({id:'export',side:'bottom',build:function(box){
  box.appendChild(h('div',{blk:'mv.export.title','data-blkname':tx('mapviz.export.title')},[h('h3',{text:tx('mapviz.export.title')})]));
  el.sw=h('input',{type:'checkbox',onchange:function(){st.on=!!el.sw.checked;st.confirm=null;if(st.on)askPlan();else{st.plan=null;st.need=null;st.pErr=null;loadTargets()}draw()}});
  box.appendChild(h('div',{'class':'fld',blk:'mv.export.switch','data-blkname':tx('mapviz.export.switch')},[h('label',{'class':'f',title:tx('mapviz.export.switchT')},[el.sw,h('span',{text:tx('mapviz.export.switch')})])]));
  el.mod=h('p',{text:''});
  box.appendChild(h('div',{blk:'mv.export.mod','data-blkname':tx('mapviz.export.blk.mod')},[el.mod]));
  el.depBtn=h('button',{type:'button',text:tx('mapviz.export.deploy'),title:tx('mapviz.export.deployT'),onclick:function(){deployList()}});
  el.dep=h('div',{role:'status','aria-live':'polite'});
  box.appendChild(h('div',{blk:'mv.export.deploy','data-blkname':tx('mapviz.export.blk.deploy')},[el.depBtn,el.dep]));
  el.files=h('div',{});
  box.appendChild(h('div',{blk:'mv.export.files','data-blkname':tx('mapviz.export.blk.files')},[el.files]));
  el.advBody=h('div',{});
  el.title=h('input',{type:'text','aria-label':tx('mapviz.export.mapTitle'),onchange:function(){var v=String(el.title.value||'').trim();if(v===st.title)return;st.title=v;askPlan();draw()}});
  el.pic=h('button',{type:'button',text:tx('mapviz.export.usePic'),title:tx('mapviz.export.usePicT'),onclick:function(){usePic()}});
  box.appendChild(h('details',{blk:'mv.export.adv','data-blkname':tx('mapviz.export.adv')},[h('summary',{text:tx('mapviz.export.adv')}),
   h('label',{'class':'f'},[h('span',{'class':'n',text:tx('mapviz.export.mapTitle')}),el.title,h('span',{'class':'hint',text:tx('mapviz.export.mapTitleT')})]),el.pic,el.advBody]));
  el.warn=h('div',{});
  box.appendChild(h('div',{blk:'mv.export.warn','data-blkname':tx('mapviz.export.blk.warn')},[el.warn]));
  el.write=h('button',{type:'button',text:tx('mapviz.export.write'),onclick:function(){askWrite()}});
  el.check=h('button',{type:'button',text:tx('mapviz.export.check'),title:tx('mapviz.export.checkT'),onclick:function(){doCheck()}});
  el.undo=h('button',{type:'button',text:tx('mapviz.export.undo'),title:tx('mapviz.export.undoT'),onclick:function(){askUndo()}});
  el.runLine=h('div',{});
  box.appendChild(h('div',{blk:'mv.export.run','data-blkname':tx('mapviz.export.blk.run')},[el.write,el.check,el.undo,el.runLine]));
  el.confirm=h('div',{role:'dialog','aria-label':tx('mapviz.export.blk.confirm')});el.confirm.hidden=true;
  box.appendChild(h('div',{blk:'mv.export.confirm','data-blkname':tx('mapviz.export.blk.confirm')},[el.confirm]));
  el.edRoot=h('input',{type:'text','aria-label':tx('mapviz.export.edRoot'),autocomplete:'off'});el.edRoot.value=lsGet();
  // the folder box is a search box like any other (owner rule): typed text finds folders picked before, Browse = the folder picker on the
  // disk at the folder in the box (else the mod), a pick puts the folder path in the box; History lists past entries
  var edKit=typeof searchKit==='function'?searchKit(el.edRoot,{key:'mapviz.exportEdRoot',index:function(q,done){q=String(q||'').toLowerCase();var a=(typeof recGet==='function'?recGet('dir'):[]).filter(function(d){return String(d).toLowerCase().indexOf(q)>=0});done(a.map(function(d){return {label:d,value:d}}))},
   browse:{mode:'dir',view:'disk',start:function(){return String(el.edRoot.value||'').trim()}}}):null;
  el.edRootBox=h('label',{'class':'f'},[h('span',{'class':'n',text:tx('mapviz.export.edRoot')}),edKit?edKit.el:el.edRoot,h('span',{'class':'hint',text:tx('mapviz.export.edRootT')})]);
  el.edBtn=h('button',{type:'button',text:tx('mapviz.export.edBtn'),title:tx('mapviz.export.edBtnT'),onclick:function(){edPlan()}});
  el.edPlan=h('div',{});
  box.appendChild(h('div',{blk:'mv.export.edshot','data-blkname':tx('mapviz.export.blk.edshot')},[el.edRootBox,el.edBtn,el.edPlan]));
  el.status=h('p',{role:'status','aria-live':'polite'});
  box.appendChild(h('div',{blk:'mv.export.status','data-blkname':tx('mapviz.export.blk.status')},[el.status]));
  draw()}});
 // a map, mode, game, folder or mod change drops the plan, the rows and the confirm; a running write goes on to its end
 chUse(V.q('target'));
 V.on('map',function(){var k=ctx();chUse(V.q('target'));if(st.dep&&st.dep.k!==k&&!depBusy())st.dep=null;if(st.pKey!==k){st.plan=null;st.pKey=null}if(st.needKey!==k){st.need=null;st.pressed=null}
  if(st.tKey!==k){st.targets=null;st.tErr=null;st.tAsk=false;st.tKey=null}st.confirm=null;st.check=null;if(st.ed&&(st.ed.map!==V.q('map')||st.ed.target!==V.q('target')||st.edCtx!==ctx()))st.ed=null;
  if(!V.q('mod')||!V.q('map'))st.on=false;
  if(V.q('map')){loadTargets();if(st.on&&!st.plan)askPlan()}draw()});
 V.on('doc',function(){if(st.tWait)loadTargets();if(st.pWait)askPlan()});
 V.on('job',function(){if(st.need)drawFiles()});
 V.on('products',function(){if(st.on&&st.need&&!runText(st.need)){st.need=null;askPlan()}draw()});
 V.on('refresh',function(){draw()});
 // the server looks every source up at the table size (2048): a picture shown at another size cannot be used as it is
 V.on('picture',function(d){var b=d&&d.base,z=d&&d.size;st.pic=b&&BASES[b]&&(z==null||z===PICSIZE)?b:null;drawTop()});
}});
})();
`;
