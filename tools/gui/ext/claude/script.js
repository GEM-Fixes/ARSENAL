// claude ext: browser script (page.js rules: no backtick, no dollar-brace, no innerHTML; DOM via h() and textContent only; ES5).
// One page for every game tab: the game only presets the default game of the servers. Download = a zip the server makes, saved
// through a link. Install = preview first (exact files and entries), then the same body with write: true after the "do it?" box.
// Author: Imperator_Aug (ARSENAL, ia-94af918b)
module.exports = String.raw`
EXT_SCREENS.claude=function(root){
  var out={},D=null,ST=null,PV=null,seq=0,pseq=0,asking=false,gameTouched=false,drawWait=false;
  function kb(n){n=+n||0;return n<1024?n+' B':(n/1024).toFixed(1)+' KB'}
  function ftx(k,fb,p){var s=tx(k,p);return s===k?fb:s}
  function qs(o){var p=[];for(var k in o)if(o[k]!=null&&o[k]!=='')p.push(k+'='+encodeURIComponent(o[k]));return p.length?'?'+p.join('&'):''}
  function emsg(e){return (e&&(e.text||e.message))||String(e)}
  function fail(box,e){if(e&&e.cancelled){result(box,'hint',emsg(e));return}result(box,'err',tx('claude.err',{m:emsg(e)}))}
  function wn(k){return {what:tx('claude.nav')+': '+tx(k)}}
  function ask(o){if(typeof askDo==='function')return askDo(o);return {then:function(cb){cb(true)}}}
  function btn(k,fn,cls){return h('button',{type:'button','class':cls||null,text:tx(k),onclick:fn})}
  function badge(t,cls){return h('span',{'class':'badge'+(cls?' '+cls:''),text:t})}
  function gname(g){return ftx('claude.g.'+g.id+'.name',g.title)}
  function gwhat(g){return ftx('claude.g.'+g.id+'.what',g.what)}
  function pwhat(p){return p.kind==='mcp'?ftx('claude.m.'+p.name,p.what):p.kind==='server'?tx('claude.srv.gui'):p.what}
  function ptitle(p){return p.kind==='mcp'?tx('claude.p.mcp',{g:p.name}):p.kind==='server'?tx('claude.p.server'):p.name}

  // ---- head
  root.appendChild(blk('title',[h('h2',{text:tx('claude.title')})]));
  root.appendChild(blk('intro',[h('p',{text:tx('claude.intro1')}),h('p',{'class':'hint',text:tx('claude.intro2')})]));

  // ---- where to install
  var tSel=h('select',{'aria-label':tx('claude.t.label')},[h('option',{value:'claude-code-user',text:tx('claude.t.user')}),h('option',{value:'claude-code-project',text:tx('claude.t.project')}),h('option',{value:'claude-desktop',text:tx('claude.t.desktop')})]);
  var dirIn=h('input',{type:'text',autocomplete:'off',spellcheck:'false','aria-label':tx('claude.dir.label'),placeholder:tx('claude.dir.ph')});
  var dirKit=searchKit(dirIn,{key:'claude.dir',index:function(s,done){done([])},browse:{mode:'dir',start:function(){return dirIn.value.trim()},out:true}});
  var dirB=blk('where.dir',[h('label',{text:tx('claude.dir.label')+' '}),dirKit.el,h('div',{'class':'hint',text:tx('claude.dir.hint')})],{name:tx('claude.dir.label')});
  var whereTxt=h('div',{'class':'hint'}),instTxt=h('div',null),unAll=btn('claude.un.all',function(){preview('uninstall',{})});
  var whereB=card('where',[blk('where.h',[h('h3',{text:tx('claude.where.h')})]),fld('where.target',tx('claude.t.label'),tSel),dirB,
    blk('where.files',[whereTxt],{name:tx('claude.b.files')}),blk('where.state',[instTxt,h('div',{'class':'row'},[unAll])],{name:tx('claude.b.state')})],{name:tx('claude.where.h')});
  root.appendChild(whereB);

  // ---- settings of the servers (all optional; out of the box every tool only reads)
  var gSel=h('select',{'aria-label':tx('claude.set.game')},[h('option',{value:'as64',text:tx('claude.game.as64')}),h('option',{value:'mowas2',text:tx('claude.game.mowas2')}),h('option',{value:'goh',text:tx('claude.game.goh')})]);
  var rootsIn=h('input',{type:'text',autocomplete:'off',spellcheck:'false','aria-label':tx('claude.set.roots'),placeholder:tx('claude.set.rootsPh')});
  var rootsKit=searchKit(rootsIn,{key:'claude.roots',index:function(s,done){done(typeof S!=='undefined'&&S&&S.mod?[{label:S.mod,value:S.mod,hint:tx('claude.set.rootsMod')}]:[])},
    browse:{mode:'dir',start:function(){var v=rootsIn.value.split(';');return (v[v.length-1]||'').trim()},out:true},
    onPick:function(v,item,from){var cur=rootsIn.value.trim();rootsIn.value=from==='browse'&&cur&&cur.split(';').indexOf(v)<0?cur.replace(/;+$/,'')+';'+v:v;changed()}});
  rootsIn.style.minWidth='min(100%,340px)';dirIn.style.minWidth='min(100%,340px)';
  var launchIn=h('input',{type:'checkbox'}),directIn=h('input',{type:'checkbox'});
  var directB=fld('set.direct',tx('claude.set.direct'),directIn,{chk:true,title:tx('claude.set.directT')});directB.hidden=true;
  var launchWarn=h('div',{'class':'err',text:tx('claude.set.launchWarn')});var launchWB=blk('set.launchw',[launchWarn],{name:tx('claude.b.launchw')});launchWB.hidden=true;
  root.appendChild(card('set',[blk('set.h',[h('h3',{text:tx('claude.set.h')}),h('div',{'class':'hint',text:tx('claude.set.hint')})]),
    fld('set.game',tx('claude.set.game'),gSel,{title:tx('claude.set.gameT')}),
    blk('set.roots',[h('label',{text:tx('claude.set.roots')+' '}),rootsKit.el,h('div',{'class':'hint',text:tx('claude.set.rootsHint')})],{name:tx('claude.set.roots')}),
    fld('set.launch',tx('claude.set.launch'),launchIn,{chk:true}),launchWB,directB],{name:tx('claude.set.h')}));

  // ---- preview / result
  var planBox=h('div',null),planB=blk('plan',[planBox],{'class':'card',name:tx('claude.b.plan')});planB.hidden=true;root.appendChild(planB);

  // ---- full pack, groups, pieces
  var fullBox=h('div',null);root.appendChild(blk('full',[fullBox],{'class':'card',name:tx('claude.full.h')}));
  var grpBox=h('div',null);root.appendChild(blk('groups',[h('h3',{text:tx('claude.groups.h')}),h('div',{'class':'hint',text:tx('claude.groups.hint')}),grpBox],{name:tx('claude.groups.h')}));
  root.appendChild(blk('list.h',[h('h3',{text:tx('claude.list.h')}),h('div',{'class':'hint',text:tx('claude.list.hint')})],{name:tx('claude.list.h')}));
  var qIn=h('input',{type:'text',autocomplete:'off','aria-label':tx('claude.q'),placeholder:tx('claude.q')}),countTxt=h('span',{'class':'hint'});
  var hay={};
  function hayOf(p){return hay[p.id]||(hay[p.id]=[p.id,p.name,ptitle(p),pwhat(p),tx('claude.kind.'+p.kind),p.groups.join(' '),p.groups.map(function(g){var G=grp(g);return G?gname(G):''}).join(' '),
    p.tools.map(function(t){return t.name+' '+t.title}).join(' '),p.files.map(function(f){return f.rel}).join(' ')].join(' ').toLowerCase())}
  function grp(id){var gs=D?D.groups:[];for(var i=0;i<gs.length;i++)if(gs[i].id===id)return gs[i];return null}
  function hits(s){s=String(s||'').toLowerCase().split(/\s+/).filter(function(w){return w});return (D?D.pieces:[]).filter(function(p){var t=hayOf(p);return s.every(function(w){return t.indexOf(w)>=0})})}
  var qKit=searchKit(qIn,{key:'claude.q',index:function(s,done){done(hits(s).map(function(p){return {label:ptitle(p),value:p.name,hint:tx('claude.kind.'+p.kind)}}))},
    browse:{mode:'file',start:function(){return D?D.root.replace(/\\/g,'/')+'/.claude/skills':''},exts:['md'],
      toValue:function(p){var m=/[\\\/]skills[\\\/]([^\\\/]+)/.exec(String(p||''));return m?m[1]:String(p||'').replace(/^.*[\\\/]/,'').replace(/\.[^.]*$/,'')}}});
  qIn.addEventListener('input',function(){drawSoon()});qIn.addEventListener('change',function(){drawSoon()});
  root.appendChild(blk('list.q',[qKit.el,countTxt],{name:tx('claude.q')}));
  var listBox=h('div',null);root.appendChild(blk('list',[listBox],{name:tx('claude.b.list')}));

  // ---- state
  function target(){return tSel.value}
  function envNow(){return {game:gSel.value,writeRoots:rootsIn.value.trim(),allowLaunch:!!launchIn.checked}}
  function bodyOf(sel){var b={target:target(),dir:target()==='claude-code-project'?dirIn.value.trim():'',env:envNow(),direct:!!directIn.checked&&!directB.hidden};
    if(sel.all)b.all=true;if(sel.piece)b.piece=sel.piece;if(sel.group)b.group=sel.group;return b}
  function installed(id){return !!(ST&&ST.pieces&&ST.pieces.indexOf(id)>=0)}
  function changed(){launchWB.hidden=!launchIn.checked;if(PV&&!PV.plan.wrote){PV=null;planB.hidden=true}}
  function targetChanged(){dirB.hidden=target()!=='claude-code-project';changed();loadStatus()}
  tSel.addEventListener('change',targetChanged);
  dirIn.addEventListener('change',function(){changed();loadStatus()});
  gSel.addEventListener('change',function(){gameTouched=true;changed()});
  rootsIn.addEventListener('change',changed);launchIn.addEventListener('change',changed);directIn.addEventListener('change',changed);
  dirB.hidden=true;

  // ---- download: the server makes the zip, the page saves it through a link
  function save(name,b64){var W=typeof window!=='undefined'?window:null;
    if(!W||!W.URL||typeof W.URL['createObjectURL']!=='function'||typeof Blob!=='function'||typeof atob!=='function'||typeof Uint8Array!=='function')return false;
    var s=atob(b64),a=new Uint8Array(s.length),i;for(i=0;i<s.length;i++)a[i]=s.charCodeAt(i);
    var url=W.URL['createObjectURL'](new Blob([a],{type:'application/zip'})),l=h('a',{href:url,download:name});l.style.display='none';
    document.body.appendChild(l);l.click();document.body.removeChild(l);
    setTimeout(function(){try{W.URL.revokeObjectURL(url)}catch(x){}},4000);return true}
  var dlBusy={};
  function download(sel){var key=JSON.stringify(sel);if(dlBusy[key])return;dlBusy[key]=1;var b=bodyOf(sel);
    api('/api/x/claude/zip',{all:b.all,piece:b.piece,group:b.group,env:b.env},wn('claude.btn.dl')).then(function(z){delete dlBusy[key];
      toast(save(z.name,z.b64)?tx('claude.dl.ok',{f:z.name,s:kb(z.bytes)}):tx('claude.dl.no'))},function(e){delete dlBusy[key];toast(tx('claude.err',{m:emsg(e)}))})}

  // ---- install / uninstall: preview, then the same body with write
  function preview(kind,sel){var b=bodyOf(sel),my=++pseq;PV=null;planB.hidden=false;loading(planBox,'claude.working');
    if(typeof JUMPS!=='undefined'&&JUMPS&&JUMPS.mark)JUMPS.mark(tx('claude.b.plan'));
    if(planB.scrollIntoView)planB.scrollIntoView({block:'nearest'});
    api('/api/x/claude/'+kind,b,wn(kind==='install'?'claude.btn.preview':'claude.btn.un')).then(function(p){if(my!==pseq)return;PV={kind:kind,sel:sel,body:JSON.stringify(b),plan:p};drawPlan()},
      function(e){if(my!==pseq)return;PV=null;fail(planBox,e)})}
  function doWrite(){if(!PV||PV.plan.wrote||PV.busy)return;var kind=PV.kind,sel=PV.sel;
    if(JSON.stringify(bodyOf(sel))!==PV.body){toast(tx('claude.plan.stale'));preview(kind,sel);return}
    var p=PV.plan,lines=[tx(kind==='install'?'claude.ask.install':'claude.ask.un',{w:p.what}),tx('claude.ask.only')];
    if(p.files&&p.files.config&&p.steps.some(function(s){return s.op==='backup'&&s.was==='new'}))lines.push(tx('claude.ask.bak',{f:p.files.config+'.arsenal-bak'}));
    ask({title:tx(kind==='install'?'claude.btn.install':'claude.btn.unNow'),lines:lines,where:targetName(p.target),ok:tx(kind==='install'?'claude.btn.install':'claude.btn.unNow'),danger:kind!=='install'}).then(function(yes){
      if(!yes||!PV||PV.plan!==p)return;PV.busy=true;var body=JSON.parse(PV.body);body.write=true;var my=++pseq;
      api('/api/x/claude/'+kind,body,wn(kind==='install'?'claude.btn.install':'claude.btn.unNow')).then(function(r){if(my!==pseq)return;PV={kind:kind,sel:sel,body:PV?PV.body:'',plan:r};if(r.status)ST=r.status;drawPlan();drawAll()},
        function(e){if(my!==pseq)return;if(PV)PV.busy=false;planBox.appendChild(result(h('div',null),'err',tx('claude.err',{m:emsg(e)})))})})}
  function targetName(t){t=String(t||'');return t.indexOf('claude-code-project:')===0?tx('claude.t.projectAt',{d:t.slice(20)}):t==='claude-desktop'?tx('claude.t.desktop'):tx('claude.t.user')}
  function stepLine(s,wrote){var t;
    if(s.op==='skill')t=tx(s.was==='new'?'claude.st.skill':'claude.st.skillRe',{n:s.name,d:s.to,c:s.files.length});
    else if(s.op==='skill-skip')t=tx('claude.st.skip',{n:s.name,d:s.to});
    else if(s.op==='skill-zip')t=tx('claude.st.zip',{n:s.name,d:s.to});
    else if(s.op==='backup')t=tx(s.was==='kept'?'claude.st.bakKept':'claude.st.bak',{f:s.file,d:s.to});
    else if(s.op==='mcp')t=tx('claude.st.mcp.'+s.was,{n:s.name,f:s.file});
    else if(s.op==='skill-remove')t=tx('claude.st.rmSkill',{n:s.name,d:s.to});
    else if(s.op==='zip-remove')t=tx('claude.st.rmZip',{d:s.to});
    else if(s.op==='mcp-remove')t=tx('claude.st.rmMcp',{n:s.name,f:s.file});
    else t=s.op;
    var li=h('li',null,[h('span',{text:t})]);
    if(wrote)li.insertBefore(badge(tx(s.error?'claude.st.failed':s.done?'claude.st.done':'claude.st.skipped'),s.error?'badx':s.done?'good':''),li.firstChild);
    if(s.op==='mcp'){var pre=h('pre',{text:s.cli||JSON.stringify(s.entry,null,1)});pre.style.margin='2px 0 6px';pre.style.whiteSpace='pre-wrap';pre.style.wordBreak='break-all';li.appendChild(pre)}
    else if(s.cli)li.appendChild(h('div',{'class':'hint',text:s.cli}));
    if(s.left)li.appendChild(h('div',{'class':'hint',text:tx('claude.st.left')}));
    if(s.error)li.appendChild(h('div',{'class':'err',text:s.error}));
    return li}
  function drawPlan(){planBox.textContent='';if(!PV){planB.hidden=true;return}planB.hidden=false;var p=PV.plan,un=PV.kind==='uninstall';
    planBox.appendChild(h('h3',{text:tx(p.wrote?(un?'claude.plan.hUnDone':'claude.plan.hDone'):(un?'claude.plan.hUn':'claude.plan.h'),{w:un&&!PV.sel.all&&!PV.sel.piece&&!PV.sel.group?tx('claude.un.every'):p.what})}));
    planBox.appendChild(h('div',{'class':'hint',text:tx('claude.plan.target',{t:targetName(p.target)})+(p.home?' '+tx('claude.plan.home',{d:p.home}):'')}));
    if(!p.wrote)planBox.appendChild(h('div',{text:tx('claude.plan.nothing')}));
    var ul=h('ul',null);(p.steps||[]).forEach(function(s){ul.appendChild(stepLine(s,p.wrote))});if(p.steps&&p.steps.length)planBox.appendChild(ul);
    if(p.kept&&p.kept.length)planBox.appendChild(h('div',{text:tx('claude.plan.kept',{l:p.kept.join(', ')})}));
    (p.notes||[]).forEach(function(n){planBox.appendChild(h('div',{'class':'hint',text:ftx('claude.n.'+n.k,n.text,n.p)}))});
    if(p.wrote){var bad=(p.errors||[]).length;
      planBox.appendChild(result(h('div',null),bad?'err':'ok',bad?tx('claude.plan.bad',{n:bad}):tx(un?'claude.plan.okUn':'claude.plan.ok')));
      if(!bad&&p.next&&p.next.length){planBox.appendChild(h('b',{text:tx('claude.plan.next')}));var nl=h('ul',null);p.next.forEach(function(n){nl.appendChild(h('li',{text:ftx('claude.x.'+n.k,n.text,n.p)}))});planBox.appendChild(nl)}}
    var row=h('div',{'class':'row'});
    if(!p.wrote&&p.steps&&p.steps.some(function(s){return s.op!=='skill-skip'}))row.appendChild(btn(un?'claude.btn.unNow':'claude.btn.install',doWrite,'primary'));
    row.appendChild(btn('claude.btn.close',function(){PV=null;pseq++;drawPlan()}));planBox.appendChild(row)}

  // ---- lists
  function acts(sel,inst){var r=h('div',{'class':'row'});r.appendChild(btn('claude.btn.dl',function(){download(sel)}));
    r.appendChild(btn('claude.btn.preview',function(){preview('install',sel)},'primary'));
    if(inst)r.appendChild(btn('claude.btn.un',function(){preview('uninstall',sel)}));return r}
  function counts(g){return tx('claude.counts',{s:g.skills,t:g.tools,b:kb(g.bytes)})}
  function instOf(g){var n=0;g.pieces.forEach(function(id){if(installed(id))n++});return n}
  function drawFull(){fullBox.textContent='';if(!D)return;var a=D.all,n=instOf(a);
    fullBox.appendChild(h('h3',{text:tx('claude.full.h')}));fullBox.appendChild(h('div',{text:tx('claude.full.what')}));
    var m=h('div',{'class':'hint',text:counts(a)+' '});if(n)m.appendChild(badge(tx('claude.inst.n',{n:n,m:a.pieces.length}),'good'));fullBox.appendChild(m);
    fullBox.appendChild(acts({all:true},false));
    if(!D.groupsFlag)fullBox.appendChild(h('div',{'class':'hint',text:tx('claude.n.noGroups')}));
    (D.errors||[]).forEach(function(e){fullBox.appendChild(h('div',{'class':'err',text:tx('claude.err',{m:(e.file||'')+' '+(e.error||'')})}))})}
  function drawGroups(){grpBox.textContent='';if(!D)return;var g=h('div',null);g.style.display='grid';g.style.gridTemplateColumns='repeat(auto-fill,minmax(260px,1fr))';g.style.gap='8px';
    D.groups.forEach(function(G){var n=instOf(G),c=h('div',{'class':'card','data-grp':G.id});c.style.margin='0';
      c.appendChild(h('b',{text:gname(G)}));c.appendChild(h('div',{text:gwhat(G)}));
      var m=h('div',{'class':'hint',text:counts(G)+' '});if(n)m.appendChild(badge(tx('claude.inst.n',{n:n,m:G.pieces.length}),'good'));c.appendChild(m);
      c.appendChild(acts({group:G.id},n>0));g.appendChild(c)});grpBox.appendChild(g)}
  function drawList(){drawWait=false;listBox.textContent='';if(!D)return;var rows=hits(qIn.value);countTxt.textContent=' '+tx('claude.count',{n:rows.length,m:D.pieces.length});
    if(!rows.length){listBox.appendChild(h('div',{'class':'hint',text:tx('claude.none')}));return}
    rows.forEach(function(p){var inst=installed(p.id),c=h('div',{'class':'card','data-piece':p.id});c.style.margin='0 0 6px';
      var hd=h('div',null,[h('b',{text:ptitle(p)+' '}),badge(tx('claude.kind.'+p.kind),p.kind==='skill'?'info':'')]);
      p.groups.forEach(function(g){var G=grp(g);hd.appendChild(badge(G?gname(G):g))});
      if(inst)hd.appendChild(badge(tx('claude.inst'),'good'));c.appendChild(hd);
      c.appendChild(h('div',{text:pwhat(p)}));
      var facts=p.kind==='skill'?tx('claude.facts.skill',{b:kb(p.bytes),n:p.files.length}):tx('claude.facts.mcp',{n:p.tools.length,s:p.server||''});
      var det=h('details',null,[h('summary',{'class':'hint',text:facts})]),ul=h('ul',null);
      if(p.kind==='skill')p.files.forEach(function(f){ul.appendChild(h('li',{text:f.rel+'  '+kb(f.bytes)}))});
      else p.tools.forEach(function(t){ul.appendChild(h('li',{text:t.name+(t.title?': '+t.title:'')+(t.kind==='write'?'  ['+tx('claude.tool.write')+']':t.kind==='launch'?'  ['+tx('claude.tool.launch')+']':'')}))});
      det.appendChild(ul);c.appendChild(det);
      c.appendChild(acts({piece:p.id},inst));listBox.appendChild(c)})}
  // once per frame; the timer is the fallback for a window that paints no frames (in the background)
  function drawTick(){if(drawWait)drawList()}
  function drawSoon(){if(drawWait)return;drawWait=true;if(typeof requestAnimationFrame==='function')requestAnimationFrame(drawTick);setTimeout(drawTick,150)}
  function drawState(){whereTxt.textContent='';instTxt.textContent='';unAll.disabled=true;directB.hidden=true;if(!ST)return;
    if(ST.need){instTxt.textContent=target()==='claude-code-project'&&!dirIn.value.trim()?tx('claude.dir.need'):ST.need;return}
    var f=ST.files||{},t=target();
    whereTxt.appendChild(h('div',{text:t==='claude-desktop'?tx('claude.where.zips',{d:f.zips||''}):tx('claude.where.skills',{d:f.skills||''})}));
    whereTxt.appendChild(h('div',{text:tx(t==='claude-code-user'&&ST.cli&&!directIn.checked?'claude.where.cli':'claude.where.cfg',{f:f.config||''})}));
    if(ST.home)whereTxt.appendChild(h('div',{text:tx('claude.plan.home',{d:ST.home})}));
    var n=(ST.pieces||[]).length;instTxt.textContent=n?tx('claude.state.n',{n:n,s:(ST.skills||[]).length+(ST.zips||[]).length,m:(ST.mcp||[]).map(function(x){return x.name}).join(', ')||tx('claude.state.noSrv')}):tx('claude.state.none');
    if(ST.moved)instTxt.appendChild(h('div',{'class':'err',text:tx('claude.state.moved',{d:ST.root||''})}));
    unAll.disabled=!((ST.skills||[]).length+(ST.zips||[]).length+(ST.mcp||[]).length);directB.hidden=!(t==='claude-code-user'&&ST.cli)}
  function drawAll(){drawState();drawFull();drawGroups();drawList()}

  // ---- data: one request at first show; status alone when the target changes
  function load(){if(asking)return;asking=true;var my=++seq;if(!D)loading(listBox,'claude.working');
    api('/api/x/claude/list'+qs({target:target(),dir:target()==='claude-code-project'?dirIn.value.trim():''}),undefined,wn('claude.job.list')).then(function(j){asking=false;if(my!==seq)return;
      var same=D&&D.sig===j.sig;D=j;ST=j.status;if(!same){hay={};qKit.refresh()}drawAll()},function(e){asking=false;if(my!==seq)return;fail(listBox,e)})}
  function loadStatus(){if(!D)return;var my=++seq;
    api('/api/x/claude/status'+qs({target:target(),dir:target()==='claude-code-project'?dirIn.value.trim():''}),undefined,{job:false}).then(function(j){if(my!==seq)return;ST=j;drawAll()},function(e){if(my!==seq)return;ST={need:emsg(e),pieces:[]};drawAll()})}
  out.refresh=function(){if(!gameTouched){var g=typeof S!=='undefined'&&S&&S.gameId;if(g==='as64'||g==='mowas2'||g==='goh')gSel.value=g}load()};
  out.focus=function(){};
  return out;
};
`;
