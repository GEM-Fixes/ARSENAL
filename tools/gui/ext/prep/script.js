// browser side of the Prepare page (gui README, CACHE contract 1). Page rules: no backtick, no dollar-brace, DOM only through h() and textContent.
// One row per prepared data section; the list is read again every 1.5 s only while something runs or waits (never listed as a job).
// Author: Imperator_Aug (ARSENAL, ia-d2a04d52)
module.exports = String.raw`
EXT_SCREENS.prep=function(root){
 var BASE='/api/x/prep/',POLL=1500;
 var ST=null,timer=null,loading=false,seenUpd=false,armed=false,armT=null,said='',saidErr=false,loadErr='';
 function mod(){return (typeof S!=='undefined'&&S&&S.mod)||''}
 function lang(){return typeof LANG==='string'?LANG:'en'}
 function onPage(){return typeof S==='undefined'||!S||S.cur==null||S.cur==='prep'}
 function sz(n){n=Number(n)||0;return n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':n<1073741824?(n/1048576).toFixed(1)+' MB':(n/1073741824).toFixed(2)+' GB'}
 function when(ms){if(ms==null)return '';try{return new Date(ms).toLocaleString()}catch(e){return ''}}
 // a note is a text, a language key, or {key, p}
 function noteT(n){if(n&&typeof n==='object')return n.key?tx(n.key,n.p||{}):'';return n==null||n===''?'':tx(String(n))}
 function whyT(w){var k='prep.why.'+w,t=tx(k);return t===k?String(w):t}
 function prog(s){var a=[];if(s.stage)a.push(tx(String(s.stage)));if(s.total)a.push((s.done||0)+' / '+s.total);else if(s.done!=null)a.push(String(s.done));return a.join(' ')}
 function stateT(s){
  if(s.running){var p=prog(s);return p?tx('prep.st.runP',{p:p}):tx('prep.st.run')}
  if(s.queued)return tx('prep.st.wait');
  if(s.state==='ready')return tx('prep.st.ready');
  if(s.state==='na')return tx('prep.st.na');
  if(s.state==='stale'){var w=(s.why||[]).map(whyT);return w.length?tx('prep.st.staleW',{w:w.join(', ')}):tx('prep.st.stale')}
  return tx('prep.st.none')}
 function isBusy(){if(!ST)return false;if(ST.checking)return true;var a=ST.sections||[];for(var i=0;i<a.length;i++)if(a[i].running||a[i].queued)return true;return false}
 function say(t,err){said=t||'';saidErr=!!err;drawMsg()}
 function fail(e){say(e&&e.cancelled?e.message:(e&&(e.text||e.message))||String(e),!(e&&e.cancelled))}

 var note=h('div',{class:'wzstat',text:tx('prep.updated')}),noteB=blk('top.updated',[note]);noteB.hidden=true;
 var modLine=h('div',{class:'hint'}),msg=h('div',{class:'hint',role:'status'});
 var bAll=h('button',{type:'button','data-act':'all',text:tx('prep.b.all'),onclick:function(){runIt('all')}});
 var bStale=h('button',{type:'button','data-act':'stale',text:tx('prep.b.stale'),onclick:function(){runIt('stale')}});
 var bCheck=h('button',{type:'button','data-act':'check',text:tx('prep.b.check'),onclick:function(){post('check',{mod:mod()})}});
 var bStop=h('button',{type:'button','data-act':'stop',text:tx('prep.b.stop'),onclick:function(){post('stop',{})}});
 var bClear=h('button',{type:'button','data-act':'clear',text:tx('prep.b.clear'),onclick:clearAll});
 var open=h('input',{type:'checkbox','data-act':'open'});open.checked=LS.get('prep.open',true)!==false;
 open.addEventListener('change',function(){LS.set('prep.open',!!open.checked)});
 var body=h('tbody'),folder=h('div',{class:'hint'});
 var table=h('table',{},[h('thead',{},[h('tr',{},['what','state','size','when','note','do'].map(function(c){return h('th',{text:tx('prep.col.'+c)})}))]),body]);

 root.appendChild(blk('title',[h('h2',{text:tx('prep.h1')})]));
 root.appendChild(card('top',[
  blk('top.intro',[h('p',{text:tx('prep.intro')}),h('p',{class:'hint',text:tx('prep.intro2')})]),
  noteB,
  blk('top.mod',[modLine]),
  h('div',{class:'row',blk:'top.btns'},[bAll,bStale,bCheck,bStop,bClear]),
  blk('top.msg',[msg]),
  fld('top.open',tx('prep.open'),open,{chk:true})],{name:tx('prep.blk.top')}));
 root.appendChild(card('list',[blk('list.rows',[table]),blk('list.folder',[folder])],{name:tx('prep.blk.list')}));

 function disarm(){armed=false;clearTimeout(armT);armT=null;bClear.textContent=tx('prep.b.clear')}
 function clearAll(){
  if(!armed){armed=true;bClear.textContent=tx('prep.b.clear2');clearTimeout(armT);armT=setTimeout(disarm,6000);return}
  disarm();post('clear',{mod:mod()},function(j){say(tx('prep.cleared',{size:sz(j&&j.bytes)}))})}
 function runIt(what){post('run',{mod:mod(),sections:what,lang:lang()},function(j){if(what==='stale'&&j&&j.queued&&!j.queued.length)say(tx('prep.nothing'))})}
 function post(path,b,then){say('');
  return api(BASE+path,b).then(function(j){if(then)then(j);return load()},function(e){fail(e);return load()})}

 function drawMsg(){var t=said,err=saidErr;if(loadErr){t=tx('prep.loaderr',{m:loadErr});err=true}if(!t&&ST&&ST.checking)t=tx('prep.checking');
  msg.textContent=t;msg.className=err?'err':'hint'}
 function rowBtn(s,act,key,keyT,off){var title=tx(s.title);
  var b=h('button',{type:'button','data-row':act,'data-sec':s.id,text:tx(key),'aria-label':tx(keyT,{s:title}),
   onclick:function(){if(act==='run')runIt([s.id]);else post('clear',{mod:mod(),section:s.id})}});
  b.disabled=!!off;return b}
 function row(s){var na=s.state==='na',work=!!(s.running||s.queued);
  var st=[h('div',{class:s.state==='ready'&&!work?'ok':null,'data-state':work?(s.running?'running':'queued'):s.state,text:stateT(s)})];
  if(s.error)st.push(h('div',{class:'err',text:tx('prep.err',{m:s.error})}));
  return h('tr',{'data-sec':s.id},[h('td',{},[h('b',{text:tx(s.title)})]),h('td',{},st),h('td',{text:s.bytes?sz(s.bytes):''}),h('td',{text:when(s.at)}),
   h('td',{class:'hint',text:noteT(s.note)}),h('td',{},[h('div',{class:'row'},[rowBtn(s,'run','prep.b.one','prep.b.oneT',na||work),rowBtn(s,'clear','prep.b.clr','prep.b.clrT',na)])])])}
 function draw(){
  var m=mod(),busy=isBusy(),secs=(ST&&ST.sections)||[];
  noteB.hidden=!seenUpd;
  modLine.textContent=m?tx('prep.mod',{m:m}):tx('prep.nomod');
  // the button that had the keyboard keeps it over a redraw
  var fa=document.activeElement,fk=fa&&fa.getAttribute&&fa.getAttribute('data-row')?fa.getAttribute('data-row')+'|'+fa.getAttribute('data-sec'):'';
  body.textContent='';
  secs.forEach(function(s){if((s.why||[]).indexOf('nomod')>=0)return;body.appendChild(row(s))});
  if(fk){var bs=body.querySelectorAll('button');for(var i=0;i<bs.length;i++)if(bs[i].getAttribute('data-row')+'|'+bs[i].getAttribute('data-sec')===fk&&!bs[i].disabled){bs[i].focus();break}}
  var st=ST&&ST.store;folder.textContent=st?tx('prep.folder',{dir:st.root||'',used:sz(st.bytes),cap:sz(st.cap)}):'';
  bAll.disabled=!ST;bStale.disabled=!ST;bClear.disabled=!ST;bStop.disabled=!busy;bCheck.disabled=!ST||!m||!!ST.checking;
  drawMsg()}
 // read the list; while something runs or waits (and this page is the one on show) read it again in 1.5 s
 function plan(){clearTimeout(timer);timer=null;if(isBusy()&&onPage())timer=setTimeout(load,POLL)}
 function load(){if(loading)return Promise.resolve();loading=true;clearTimeout(timer);timer=null;
  return api(BASE+'state?mod='+encodeURIComponent(mod()),undefined,{job:false}).then(function(j){loading=false;loadErr='';ST=j;if(j&&j.updated)seenUpd=true;draw();plan()},
   function(e){loading=false;loadErr=(e&&(e.text||e.message))||String(e);draw()})}
 draw();
 return {refresh:load,focus:function(){load()}}};
`;
