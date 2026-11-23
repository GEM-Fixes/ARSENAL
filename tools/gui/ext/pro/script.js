// pro ext: browser script (page.js rules: no backtick, no dollar-brace, no innerHTML; DOM via h() and textContent only).
// Sub-pages: All tools (E-13), Diff (E-4), Sheets (E-7), Conflicts (E-15), Copy as command (E-30).
// Author: Imperator_Aug (ARSENAL, ia-e88f51aa)
module.exports = String.raw`
EXT_SCREENS.pro=function(root){
  var P={tab:LS.get('pro.tab','tools'),tools:[],sel:null,mods:[],sheets:null,sheet:'weapons',sort:{c:-1,d:1}};
  function el(tag,cls,text,kids){return h(tag,{class:cls||null,text:text==null?null:text},kids||[])}
  function btn(k,fn,cls){return h('button',{type:'button',class:cls||null,text:tx(k),onclick:fn})}
  function inp(ph,w){var i=h('input',{type:'text',placeholder:ph||'',autocomplete:'off'});if(w)i.style.width=w;return i}
  function label(text,ctl){var l=el('label',null,text+' ');l.appendChild(ctl);return l}
  function note(p,msg,bad){p.textContent='';p.appendChild(el('p',bad?'err':'hint',msg))}
  // JOBS: a request stopped from the footer (e.cancelled) is no error: the plain line Stopped
  function fail(p,e){if(e&&e.cancelled){note(p,e.message||'');return}note(p,tx('pro.err',{m:e.message}),true)}
  function pre(t){var p=el('pre',null,t);p.style.whiteSpace='pre-wrap';p.style.maxHeight='420px';p.style.overflow='auto';return p}
  function badge(t,col){var b=el('span',null,t);b.style.background=col;b.style.color='var(--fg)';b.style.padding='0 6px';b.style.borderRadius='8px';b.style.fontSize='11px';b.style.marginLeft='6px';return b}
  function copy(t){if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){toast(tx('pro.copied'))},function(){fallback(t)});else fallback(t)}
  function fallback(t){var a=h('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy');toast(tx('pro.copied'))}catch(e){toast(tx('pro.copyfail'))}a.remove()}
  function filePick(i){return btn('pro.pickfile',function(){pick('file','',function(p){i.value=p})})}
  // searchKit (page.js; owner 2026-11-19: every search box has a manual browse, an indexed search and a history list). Index rows carry
  // their lowercase text (lo); the first 40 hits are drawn, the rest counted
  function hits(a,q,done){q=String(q||'').toLowerCase();var out=[],n=0;for(var i=0;i<a.length;i++)if(a[i].lo.indexOf(q)>=0){n++;if(out.length<40)out.push(a[i])}done(out,n-out.length)}
  function frame(f){(window.requestAnimationFrame||function(g){return setTimeout(g,16)})(f)}
  function gameNow(){return (typeof curFolder==='function'?curFolder():gameDir())||''}
  // the folders the GUI knows, read once per mod and game: this mod, the game folder(s), the mods in the game's mods folder (/api/installed)
  var FO={k:null,a:null,w:[]};
  function folders(cb){var k=String(S.mod||'')+'|'+(S.gameId||'')+'|'+gameNow();if(FO.k!==k)FO={k:k,a:null,w:[]};if(FO.a){cb(FO.a);return}FO.w.push(cb);if(FO.w.length>1)return;var me=FO;
    api('/api/installed',undefined,{what:tx('pro.job.mods')}).then(function(j){return j||{}},function(){return {}}).then(function(j){var a=[],seen={};
      function add(p,g){p=String(p||'');var lo=p.toLowerCase();if(!p||seen[lo])return;seen[lo]=1;a.push({label:p.replace(/[\\\/]+$/,'').split(/[\\\/]/).pop()||p,value:p,hint:p+'  ('+tx(g)+')',lo:lo})}
      add(S.mod,'pro.g.mod');add(gameNow(),'pro.g.game');if(typeof gameDir==='function')add(gameDir(),'pro.g.game');add(j.game,'pro.g.game');
      if(j.game)(j.mods||[]).forEach(function(m){add(String(j.game).replace(/[\\\/]+$/,'')+'/mods/'+m.name,'pro.g.mods')});
      me.a=a;me.w.splice(0).forEach(function(f){f(a)})})}
  // map, unit/weapon and resource folder names of the game (GET /api/x/pro/names), read once per game
  var NM={k:null,d:null,w:[]};
  function gnames(cb){var k=(S.gameId||'')+'|'+gameNow();if(NM.k!==k)NM={k:k,d:null,w:[]};if(NM.d){cb(NM.d);return}NM.w.push(cb);if(NM.w.length>1)return;var me=NM;
    api('/api/x/pro/names',undefined,{what:tx('pro.job.names')}).then(function(j){return j||{}},function(){return {}}).then(function(j){
      var it=function(a){return (a||[]).map(function(v){return {label:v,value:v,lo:String(v).toLowerCase()}})};
      me.d={maps:it(j.maps),dirs:it(j.dirs),names:(j.names||[]).map(function(x){return {hint:tx(x.k==='unit'?'pro.g.units':'pro.g.stuff'),label:x.n,value:x.n,lo:String(x.n).toLowerCase()}})};
      me.w.splice(0).forEach(function(f){f(me.d)})})}
  // a folder box: index = the known folders, Browse = the folder picker on the disk at the folder in the box, else at = 'game' (the game
  // folder) or the mod (else the game folder); out: a folder to write to. A pick puts the folder path in the box
  function dirKit(i,key,at,out){return searchKit(i,{key:key,index:function(q,done){folders(function(a){hits(a,q,done)})},
    browse:{mode:'dir',view:'disk',out:!!out,start:function(){return i.value.trim()||(at==='game'?gameNow():S.mod||gameNow())}}})}
  // a game-names box (maps, names, dirs): index = that list; Browse = the picker in the game's data where those things live (BR)
  function base(p,e){return String(e&&e.name||p).replace(/[\\\/]+$/,'').split(/[\\\/]/).pop().replace(/\.[^.]*$/,'')}
  function gpath(p,e){return String(e&&e.path||p||'').split(String.fromCharCode(92)).join('/').replace(/^resource\//i,'').replace(/\/+$/,'')}
  var BR={
    // a map as misdiff --map takes it: multi/<name> from map/multi/<name>/...
    maps:{mode:'dir',view:'data',start:'map',toValue:function(p,e){var m=/^map\/([^\/]+\/[^\/]+)/i.exec(gpath(p,e));return m?m[1]:''}},
    // a unit or weapon name: the .def / .set / .ext files under entity/ (set/stuff is beside it), the name without its extension
    names:{mode:'file',view:'data',start:'entity',exts:['def','set','ext'],toValue:function(p,e){return base(p,e)}},
    // a game folder as conflicts --file takes it: resource/<folder>/**
    dirs:{mode:'dir',view:'data',start:'',toValue:function(p,e){var g=gpath(p,e);return g?'resource/'+g+'/**':''}}};
  function nameKit(i,key,kind){return searchKit(i,{key:key,index:function(q,done){gnames(function(d){hits(d[kind],q,done)})},browse:BR[kind]})}
  // the mod boxes of a tool run (pro.mod): they start at the header's mod and follow it while not typed in; a typed or picked folder stays
  var MODS=[];
  function modIn(i){i.value=S.mod||'';i.addEventListener('input',function(){i.dataset.own='1'});i.addEventListener('change',function(){i.dataset.own=i.value.trim()&&i.value.trim()!==S.mod?'1':''});MODS.push(i);return i}
  function followMod(){MODS.forEach(function(i){if(i.dataset.own!=='1'&&i!==document.activeElement)i.value=S.mod||''})}
  function lineBox(t){if(!t)return el('span');var r=el('div','row');r.appendChild(el('code',null,t));r.appendChild(btn('pro.copy',function(){copy(t)}));return r}

  // blocks: lf = leaf, row = leaf toolbar, nm = text key of its name; ids from code constants only
  function lf(id,kids,nm,cls){return h('div',{class:cls||null,blk:id,'data-blkname':nm?tx(nm):null},kids||[])}
  function row(id,kids,nm){return lf(id,kids,nm,'row')}
  function pcard(id,tk,ik){return card(id,[blk(id+'.title',[el('h3',null,tx(tk))]),blk(id+'.intro',[el('p','hint',tx(ik))])])}

  root.appendChild(blk('title',[el('h2',null,tx('pro.title'))]));
  root.appendChild(blk('intro',[el('p',null,tx('pro.intro'))]));
  var safe=el('div',null,tx('pro.safe'));safe.style.border='1px solid var(--warnl)';safe.style.padding='6px 10px';safe.style.margin='6px 0 10px';safe.style.borderRadius='4px';root.appendChild(asBlk(safe,'safe'));
  var tabs=row('tabs',[],'pro.blk.tabs');tabs.style.margin='10px 0';root.appendChild(tabs);
  var panes={},tb={};
  ['tools','diff','sheet','conf','copy'].forEach(function(k){tb[k]=btn('pro.tab.'+k,function(){showTab(k)});tabs.appendChild(tb[k]);panes[k]=h('div',{blk:k,box:'col','data-blkname':tx('pro.tab.'+k)});panes[k].hidden=true;root.appendChild(panes[k])});
  var built={};
  function showTab(k){if(!panes[k])k='tools';P.tab=k;LS.set('pro.tab',k);for(var x in panes){panes[x].hidden=x!==k;tb[x].className=x===k?'primary':''}
    if(!built[k]){built[k]=1;({tools:mkTools,diff:mkDiff,sheet:mkSheet,conf:mkConf,copy:mkCopy})[k](panes[k])}}

  // shared: installed mods (load order as the Mods page keeps it)
  // lazy: what a tab asks while it is built (the tool list, the installed mods) is asked at the first show of the page (show0: refresh, then focus)
  var SHOWN=false,LATE=[];
  function late(f){if(SHOWN)f();else LATE.push(f)}
  function first(){if(SHOWN)return;SHOWN=true;LATE.splice(0).forEach(function(f){f()})}
  function loadMods(cb){late(function(){loadMods0(cb)})}
  function loadMods0(cb){api('/api/installed',undefined,{what:tx('pro.job.mods')}).then(function(j){P.mods=(j.mods||[]).map(function(m){return m.name});cb&&cb(j)}).catch(function(){P.mods=[];cb&&cb({})})}
  // the mod list box (comma separated): the index offers installed mods for the text after the last comma, a pick replaces that part
  function modsBox(){var i=inp(tx('pro.mods.ph'),'60%'),ready=false,wait=[];
    function mods(cb){if(ready){cb(modItems());return}wait.push(cb)}
    function modItems(){return P.mods.map(function(m){return {label:m,value:m,lo:String(m).toLowerCase()}})}
    loadMods(function(){ready=true;wait.splice(0).forEach(function(f){f(modItems())})});
    // Browse = the game's mods folder on the disk; a picked mod folder gives its name (added after the last comma)
    var kit=searchKit(i,{key:'pro.mods',index:function(q,done){var t=String(q||'').split(',').pop().trim();mods(function(a){hits(a,t,done)})},
      browse:{mode:'dir',view:'disk',start:function(){var g=gameNow();return g?g.replace(/[\\\/]+$/,'')+'/mods':''},toValue:function(p){return String(p||'').replace(/[\\\/]+$/,'').split(/[\\\/]/).pop()}},
      onPick:function(v,item,from){var cur=i.value,c=cur.lastIndexOf(','),t=cur.replace(/[,\s]+$/,'');
        i.value=from==='browse'?(t?t+','+v:v):from==='history'||c<0?v:cur.slice(0,c+1)+v;kit.remember(i.value)}});
    var w=el('span',null,null,[kit.el]);w.input=i;return w}
  // the current game's own folder (the GoH install on the GoH tab, else the AS2 install); the routes add --exe for MoW:AS2 and GoH
  function gameBox(){var i=inp(tx('pro.game.ph'),'50%');i.value=(typeof curFolder==='function'?curFolder():gameDir())||'';var w=el('span',null,null,[dirKit(i,'pro.game','game').el]);w.input=i;return w}
  // a tool's own "not available for <game>" line: a plain line, not an error
  function naLine(p,j){if(!j||!j.na)return false;p.textContent='';if(j.line)p.appendChild(lineBox(j.line));p.appendChild(el('p','hint',tx('pro.na',{m:j.na})));return true}

  // ---- E-13 All tools
  function mkTools(p){
    var top=row('tools.top',[],'pro.blk.find'),q=inp(tx('pro.tools.search'),'40%'),qKit=searchKit(q,{key:'pro.tools.q',index:function(s,done){hits(TI,s,done)},
      // Browse = the tools folder on the disk (TD, from the tools route), .js files; a picked file gives the tool it belongs to
      browse:{mode:'file',view:'disk',exts:['js'],start:function(){return TD},toValue:function(p){return toolOf(p)}},
      onPick:function(v){q.value=v;sched();var x=P.tools.filter(function(t){return t.name===v})[0];if(x)open(x)}}),TI=[],TD='',only=h('select',{'aria-label':tx('pro.tools.show')});
    [['all','pro.tools.all'],['ok','pro.state.ok'],['dry','pro.state.dry'],['block','pro.state.block']].forEach(function(o){only.appendChild(h('option',{value:o[0],text:tx(o[1])}))});
    top.appendChild(qKit.el);top.appendChild(label(tx('pro.tools.show'),only));var cnt=el('span','hint');top.appendChild(cnt);p.appendChild(top);
    var list=el('div');list.style.maxHeight='620px';list.style.overflow='auto';
    var det=el('div','card');note(det,tx('pro.tools.pickone'));
    p.appendChild(h('div',{blk:'tools.main',box:'cols','data-blkname':tx('pro.blk.main')},[lf('tools.list',[list],'pro.blk.list'),lf('tools.det',[det],'pro.blk.det')]));
    var COL={ok:'var(--goodbg)',dry:'var(--warnbg)',block:'var(--crash)'};
    // typing: the list is drawn in the next frame on precomputed lowercase text (x.lo)
    var pend=false;function sched(){if(pend)return;pend=true;frame(function(){pend=false;draw()})}
    function draw(){list.textContent='';var t=q.value.trim().toLowerCase(),n=0;
      P.tools.forEach(function(x){if(only.value!=='all'&&x.state!==only.value)return;
        if(t&&x.lo.indexOf(t)<0)return;n++;
        var r=el('div');r.style.cursor='pointer';r.style.padding='3px 4px';r.style.borderBottom='1px solid var(--line2)';
        r.appendChild(el('b',null,x.name));r.appendChild(badge(tx('pro.state.'+x.state),COL[x.state]));r.appendChild(el('div','hint',x.what.slice(0,140)));
        r.onclick=function(){open(x)};list.appendChild(r)});
      cnt.textContent=tx('pro.tools.count',{n:n,t:P.tools.length})}
    q.addEventListener('input',sched);only.onchange=draw;
    function slash(s){return String(s||'').split(String.fromCharCode(92)).join('/').replace(/\/+$/,'')}
    function toolOf(p){p=slash(p);var d=slash(TD),rel=d&&p.toLowerCase().indexOf(d.toLowerCase()+'/')===0?p.slice(d.length+1):'',hit=null;
      P.tools.forEach(function(t){if(!hit&&rel&&slash(t.entry).toLowerCase()===rel.toLowerCase())hit=t});
      if(hit)return hit.name;var f=rel?rel.split('/')[0]:'';P.tools.forEach(function(t){if(!hit&&f&&t.name.toLowerCase()===f.toLowerCase())hit=t});
      return hit?hit.name:f||base(p)}
    late(function(){api('/api/x/pro/tools',undefined,{what:tx('pro.job.tools')}).then(function(j){P.tools=j.tools||[];TD=j.dir||'';
      P.tools.forEach(function(x){x.lo=(x.name+' '+x.group+' '+x.what+' '+x.run).toLowerCase()});
      TI=P.tools.map(function(x){return {group:x.group,label:x.name,value:x.name,hint:String(x.what||'').slice(0,80),lo:x.lo}});qKit.refresh();if(j.from==='bundled')top.appendChild(el('span','hint',tx('pro.tools.bundled')));draw()}).catch(function(e){fail(list,e)})});
    function open(x){P.sel=x;det.textContent='';
      det.appendChild(el('h3',null,x.name+'  ('+x.group+')'));det.appendChild(el('p',null,x.what));
      det.appendChild(el('div','hint',tx('pro.tools.runline')));det.appendChild(el('code',null,x.run));
      var st=el('p',x.state==='block'?'err':'hint',x.state==='block'?tx('pro.why.'+(x.why||'unknown')):x.state==='dry'?tx('pro.tools.needdry',{d:x.dry||''}):tx('pro.tools.safe'));det.appendChild(st);
      var help=el('div');det.appendChild(help);note(help,tx('pro.loading'));
      api('/api/x/pro/help',{tool:x.name},{what:tx('pro.job.help')}).then(function(j){help.textContent='';if(j.text)help.appendChild(pre(j.text));else{help.appendChild(el('p','hint',tx('pro.help.none')));
        if(x.state!=='block')help.appendChild(btn('pro.help.run',function(){api('/api/x/pro/help',{tool:x.name,run:true}).then(function(k){help.textContent='';help.appendChild(pre(k.text||tx('pro.help.empty')))}).catch(function(e){fail(help,e)})}))}}).catch(function(e){fail(help,e)});
      if(x.state==='block')return;
      var args=h('textarea',{rows:'2','aria-label':tx('pro.args')});args.style.width='100%';args.value=LS.get('pro.args.'+x.name,'');
      det.appendChild(el('div',null,tx('pro.args')));det.appendChild(args);det.appendChild(el('div','hint',tx('pro.args.hint')));
      var mod=modIn(inp(tx('pro.mod.ph'),'45%')),gm=gameBox();
      det.appendChild(el('div','row',null,[label(tx('pro.mod'),dirKit(mod,'pro.mod').el),btn('pro.ins.mod',function(){args.value=(args.value+' {mod}').trim()})]));
      det.appendChild(el('div','row',null,[label(tx('pro.game'),gm),btn('pro.ins.game',function(){args.value=(args.value+' {game}').trim()}),btn('pro.ins.exe',function(){args.value=(args.value+' --exe {exe}').trim()}),btn('pro.ins.goh',function(){args.value=(args.value+' {goh}').trim()})]));
      var to=h('input',{type:'number',min:'5',max:'600',value:'120'});to.style.width='70px';
      var row=el('div','row');det.appendChild(row);var stat=el('div');det.appendChild(stat);var out=el('div');det.appendChild(out);
      function body(){LS.set('pro.args.'+x.name,args.value);return {tool:x.name,args:args.value,mod:mod.value.trim(),game:gm.input.value.trim(),timeoutSec:Number(to.value)||120}}
      function verdict(j){stat.textContent='';if(j.line)stat.appendChild(lineBox(j.line.node));
        if(!j.ok)stat.appendChild(el('p','err',tx('pro.why.'+j.why,{f:j.flag||'',d:j.dry||''})));else stat.appendChild(el('p','ok',j.dry?tx('pro.check.dry'):tx('pro.check.ok')));
        if(j.exeHint)stat.appendChild(el('p','hint',tx('pro.exe.hint')))}
      row.appendChild(btn('pro.check',function(){api('/api/x/pro/check',body()).then(verdict).catch(function(e){fail(stat,e)})}));
      row.appendChild(btn('pro.run',function(){out.textContent='';note(stat,tx('pro.running'));api('/api/x/pro/run',body()).then(function(j){verdict(j);if(!j.ran)return;if(j.na){out.appendChild(el('p','hint',tx('pro.na',{m:j.na})));return}
        out.appendChild(el('p',j.code===0?'ok':'err',tx(j.timedOut?'pro.run.timeout':'pro.run.done',{c:j.code,s:Math.round(j.ms/100)/10})));
        if(j.stdout)out.appendChild(pre(j.stdout));if(j.stderr){out.appendChild(el('div','hint',tx('pro.run.stderr')));out.appendChild(pre(j.stderr))}}).catch(function(e){fail(stat,e)})},'primary'));
      row.appendChild(label(tx('pro.timeout'),to))}
  }

  // ---- E-4 Diff
  function sumList(p,rows){var u=el('ul');rows.forEach(function(r){if(r[1])u.appendChild(el('li',null,tx(r[0],{n:r[1]})))});if(!u.children.length)u.appendChild(el('li',null,tx('pro.d.none')));p.appendChild(u)}
  function itemsTable(p,it){if(!it||!it.length)return;var d=h('details');d.appendChild(h('summary',{text:tx('pro.d.details',{n:it.length})}));
    d.appendChild(table(['code','file','line','msg'],it.slice(0,3000).map(function(x){return [x.code,x.file||'',String(x.line||''),x.msg||'']})));p.appendChild(d)}
  function mkDiff(p){
    // overdiff
    var c1=pcard('diff.od','pro.od.title','pro.od.intro');p.appendChild(c1);
    var odMod=modIn(inp(tx('pro.mod.ph'),'50%'));var odMods=modsBox(),odGame=gameBox(),o1=el('div');
    c1.appendChild(row('diff.od.mod',[label(tx('pro.mod'),dirKit(odMod,'pro.mod').el)]));c1.appendChild(row('diff.od.mods',[label(tx('pro.od.or'),odMods)]));c1.appendChild(row('diff.od.game',[label(tx('pro.game'),odGame)]));
    c1.appendChild(lf('diff.od.go',[btn('pro.od.go',function(){note(o1,tx('pro.running'));api('/api/x/pro/overdiff',{mod:odMod.value.trim(),mods:odMods.input.value,game:odGame.input.value.trim()}).then(function(j){o1.textContent='';if(naLine(o1,j))return;
      if(j.notInGame){o1.appendChild(el('p','err',tx('pro.od.notInGame',{m:j.mod})));return}
      o1.appendChild(lineBox(j.line));var s=j.summary;
      if(j.via)o1.appendChild(el('p','hint',tx(j.via.how==='copy'?'pro.od.viaCopy':'pro.od.viaLink',{m:j.via.dir})));
      o1.appendChild(el('p',null,tx('pro.od.files',{n:s.files})));
      sumList(o1,[['pro.od.unread',s.unreadable],['pro.od.changed',s.changed],['pro.od.added',s.added],['pro.od.removed',s.removed],['pro.od.full',s.fullShadow],['pro.od.same',s.identical],['pro.od.opaque',s.opaque],['pro.od.deleted',s.deleted]]);
      itemsTable(o1,j.items)}).catch(function(e){fail(o1,e)})},'primary')]));c1.appendChild(lf('diff.od.out',[o1],'pro.blk.res'));
    // misdiff
    var c2=pcard('diff.md','pro.md.title','pro.md.intro');p.appendChild(c2);
    var ma=inp(tx('pro.md.a'),'50%'),mb=inp(tx('pro.md.b'),'50%'),mmap=inp(tx('pro.md.map'),'30%'),mmods=modsBox(),mg=gameBox(),o2=el('div');
    c2.appendChild(row('diff.md.a',[label(tx('pro.md.a'),dirKit(ma,'pro.mapdir').el)]));c2.appendChild(row('diff.md.b',[label(tx('pro.md.b'),dirKit(mb,'pro.mapdir').el)]));
    c2.appendChild(lf('diff.md.or',[el('p','hint',tx('pro.md.or'))]));c2.appendChild(row('diff.md.map',[label(tx('pro.md.map'),nameKit(mmap,'pro.map','maps').el),label(tx('pro.mods'),mmods)]));c2.appendChild(row('diff.md.game',[label(tx('pro.game'),mg)]));
    c2.appendChild(lf('diff.md.go',[btn('pro.md.go',function(){note(o2,tx('pro.running'));var b=mmap.value.trim()?{map:mmap.value.trim(),mods:mmods.input.value,game:mg.input.value.trim()}:{a:ma.value.trim(),b:mb.value.trim()};
      api('/api/x/pro/misdiff',b).then(function(j){o2.textContent='';if(naLine(o2,j))return;o2.appendChild(lineBox(j.line));var s=j.summary;
      sumList(o2,[['pro.md.added',s.added],['pro.md.removed',s.removed],['pro.md.moved',s.moved],['pro.md.changed',s.changed],['pro.md.logic',s.logic],['pro.md.modes',s.modes],['pro.md.other',s.other],['pro.md.warn',s.warnings]]);
      itemsTable(o2,j.items)}).catch(function(e){fail(o2,e)})},'primary')]));c2.appendChild(lf('diff.md.out',[o2],'pro.blk.res'));
    // conflicts (quick)
    var c3=pcard('diff.cf','pro.cf.title','pro.cf.intro');p.appendChild(c3);
    var cm=modsBox(),cg=gameBox(),o3=el('div');c3.appendChild(row('diff.cf.mods',[label(tx('pro.mods'),cm)]));c3.appendChild(row('diff.cf.game',[label(tx('pro.game'),cg)]));
    c3.appendChild(row('diff.cf.btns',[btn('pro.cf.go',function(){note(o3,tx('pro.running'));api('/api/x/pro/conflicts',{mods:cm.input.value,game:cg.input.value.trim()}).then(function(j){o3.textContent='';if(naLine(o3,j))return;o3.appendChild(lineBox(j.line));confSummary(o3,j)}).catch(function(e){fail(o3,e)})},'primary'),
      btn('pro.cf.open',function(){showTab('conf')})]));c3.appendChild(lf('diff.cf.out',[o3],'pro.blk.res'));
    // verdiff
    var c4=pcard('diff.vd','pro.vd.title','pro.vd.intro');p.appendChild(c4);
    var va=inp(tx('pro.vd.a'),'50%'),vb=inp(tx('pro.vd.b'),'50%'),o4=el('div');
    c4.appendChild(row('diff.vd.a',[label(tx('pro.vd.a'),dirKit(va,'pro.version').el),filePick(va)]));c4.appendChild(row('diff.vd.b',[label(tx('pro.vd.b'),dirKit(vb,'pro.version').el),filePick(vb)]));
    c4.appendChild(lf('diff.vd.go',[btn('pro.vd.go',function(){note(o4,tx('pro.running'));api('/api/x/pro/verdiff',{a:va.value.trim(),b:vb.value.trim()}).then(function(j){o4.textContent='';o4.appendChild(lineBox(j.line));var s=j.summary;
      sumList(o4,[['pro.vd.added',s.added],['pro.vd.removed',s.removed],['pro.vd.changed',s.changed],['pro.vd.renames',s.renames],['pro.vd.maybes',s.maybes]]);
      if(s.differ)o4.appendChild(el('p','hint',tx('pro.vd.differ')));else if(s.snap)o4.appendChild(el('p','hint',tx('pro.vd.snap')));
      if(j.keys){var r=[];for(var k in j.keys){var x=j.keys[k];r.push([k,String(x.files||0),String(x.added||0),String(x.removed||0)])}if(r.length)o4.appendChild(table([tx('pro.vd.kind'),tx('pro.vd.files'),tx('pro.vd.kadd'),tx('pro.vd.krem')],r))}
      if(j.text){var d=h('details');d.appendChild(h('summary',{text:tx('pro.vd.text')}));d.appendChild(pre(j.text));o4.appendChild(d)}}).catch(function(e){fail(o4,e)})},'primary')]));c4.appendChild(lf('diff.vd.out',[o4],'pro.blk.res'));
  }

  // ---- sortable, filterable table
  function table(cols,rows,filt){
    // the filter box: index = the distinct cell values (by column), each row's lowercase text made once; drawn in the next frame, 200 rows
    // at first and a Show more button
    var w=el('div'),f=inp(tx('pro.filter'),'40%'),LO=rows.map(function(x){return x.join(' ').toLowerCase()}),VI=null,lim=200,pend=false;
    // Browse: the rows come from game files, so the picker opens in the game's data at the folder of the first row's file (a column
    // named file), else at the top; a picked file gives its name, and the filter (on the whole row text) keeps the rows of that file
    function fileDir(){var c=-1,v='';cols.forEach(function(x,i){if(c<0&&(String(x).toLowerCase()==='file'||String(x)===tx('pro.cr.c.file')))c=i});
      for(var i=0;c>=0&&i<rows.length&&!v;i++)v=String(rows[i][c]||'');v=v.split(String.fromCharCode(92)).join('/').replace(/^resource\//i,'');var k=v.lastIndexOf('/');return k>0?v.slice(0,k):''}
    function vals(){if(VI)return VI;VI=[];var seen={};rows.forEach(function(x){x.forEach(function(v,i){v=String(v==null?'':v);var k=i+'|'+v;if(!v||seen[k]||VI.length>=20000)return;seen[k]=1;VI.push({group:String(cols[i]),label:v,value:v,lo:v.toLowerCase()})})});return VI}
    if(filt!==false)w.appendChild(searchKit(f,{key:'pro.table.filter',index:function(q,done){hits(vals(),q,done)},browse:{mode:'file',view:'data',start:fileDir,toValue:function(p,e){return String(e&&e.name||p).split('/').pop()}}}).el);var cnt=el('span','hint');w.appendChild(cnt);
    var box=el('div');box.style.maxHeight='560px';box.style.overflow='auto';w.appendChild(box);var so={c:-1,d:1};
    function sched(){if(pend)return;pend=true;frame(function(){pend=false;draw()})}
    function num(v){var n=parseFloat(v);return isNaN(n)||!/^\s*-?[\d.]/.test(v)?null:n}
    function draw(){var t=f.value.trim().toLowerCase(),r=rows;
      if(t)r=rows.filter(function(x,i){return LO[i].indexOf(t)>=0});
      if(so.c>=0){r=r.slice().sort(function(a,b){var x=a[so.c]||'',y=b[so.c]||'',nx=num(x),ny=num(y);if(nx!=null&&ny!=null)return (nx-ny)*so.d;return x.localeCompare(y)*so.d})}
      cnt.textContent=' '+tx('pro.rows',{n:r.length,t:rows.length});
      var tbl=h('table',{class:'tbl'}),hr=h('tr');cols.forEach(function(c,i){var th=h('th',{text:c+(so.c===i?(so.d>0?' ▲':' ▼'):''),title:tx('pro.sort')});th.style.cursor='pointer';
        th.onclick=function(){if(so.c===i)so.d=-so.d;else{so.c=i;so.d=1}draw()};hr.appendChild(th)});tbl.appendChild(hr);
      r.slice(0,lim).forEach(function(x){var tr=h('tr');x.forEach(function(v){tr.appendChild(h('td',{text:v}))});tbl.appendChild(tr)});
      box.textContent='';box.appendChild(tbl);
      if(r.length>lim)box.appendChild(h('button',{type:'button',text:tx('pro.showMore',{n:Math.min(500,r.length-lim)}),onclick:function(){lim+=500;draw()}}))}
    f.addEventListener('input',function(){lim=200;sched()});draw();return w}

  // ---- E-7 Sheets
  function mkSheet(p){
    p.appendChild(lf('sheet.intro',[el('p','hint',tx('pro.sh.intro'))]));
    var g=gameBox(),m=modsBox(),fo=inp(tx('pro.sh.folder'),'45%'),fl=inp(tx('pro.sh.filter'),'25%'),sc=h('select',{'aria-label':tx('pro.sh.scope')});
    [['all','pro.sh.scope.all'],['mod','pro.sh.scope.mod']].forEach(function(o){sc.appendChild(h('option',{value:o[0],text:tx(o[1])}))});
    p.appendChild(row('sheet.game',[label(tx('pro.game'),g)]));p.appendChild(row('sheet.mods',[label(tx('pro.mods'),m),label(tx('pro.sh.scope'),sc)]));
    p.appendChild(row('sheet.folder',[label(tx('pro.sh.folder'),dirKit(fo,'pro.sheet.folder').el)]));p.appendChild(row('sheet.filter',[label(tx('pro.sh.filter'),nameKit(fl,'pro.sheet.filter','names').el)]));
    var tabs2=el('div','row'),o=el('div'),shTb=null;
    p.appendChild(lf('sheet.go',[btn('pro.sh.go',function(){note(o,tx('pro.sh.wait'));tabs2.textContent='';
      api('/api/x/pro/sheet',{game:g.input.value.trim(),mods:m.input.value,folder:fo.value.trim(),filter:fl.value.trim(),scope:sc.value}).then(function(j){if(naLine(o,j))return;P.sheets=j.sheets;o.textContent='';o.appendChild(lineBox(j.line));
        ['weapons','ammo','armor','price','research'].forEach(function(k){if(!P.sheets[k])return;tabs2.appendChild(btn('pro.sh.'+k,function(){P.sheet=k;drawSheet()}))});
        o.appendChild(tabs2);var tb=el('div');tb.id='prosheet';shTb=tb;o.appendChild(tb);if(!P.sheets[P.sheet])P.sheet=Object.keys(P.sheets)[0];drawSheet()}).catch(function(e){fail(o,e)})},'primary')]));
    p.appendChild(lf('sheet.out',[o],'pro.blk.res'));
    function drawSheet(){var tb=shTb;if(!tb)return;tb.textContent='';var s=P.sheets[P.sheet];
      tb.appendChild(el('h3',null,tx('pro.sh.'+P.sheet)));
      if(!s||!s.rows.length){tb.appendChild(el('p','hint',tx('pro.sh.empty')));return}
      tb.appendChild(table(s.cols,s.rows))}
  }

  // ---- E-15 Conflicts resolver
  function confSummary(o,j){var s=j.summary;
    sumList(o,[['pro.cf.keys',s.keys],['pro.cf.modmod',s.modMod],['pro.cf.over',s.overridden],['pro.cf.shadow',s.shadowed],['pro.cf.fshadow',s.fileShadow],['pro.cf.opaque',s.opaque]]);
    var r=[];(j.order||[]).forEach(function(m,i){var x=j.perMod[m]||{wins:0,loses:0};r.push([String(i+1),m,String(x.wins),String(x.loses)])});
    if(r.length)o.appendChild(table([tx('pro.cf.pos'),tx('pro.cf.mod'),tx('pro.cf.wins'),tx('pro.cf.loses')],r,false));
    // the same kind groups and codes as Share > Mods together, read-only; the guided fixes are on that tab
    var gs=j.groups||[];if(gs.length){o.appendChild(el('h3',null,tx('pro.cf.kinds')));
      o.appendChild(table([tx('pro.cf.k.kind'),tx('pro.cf.k.n'),tx('pro.cf.k.wins'),tx('pro.cf.k.codes'),tx('pro.cf.k.files')],gs.map(function(g){var w=[];Object.keys(g.wins||{}).forEach(function(m){w.push(m+' '+g.wins[m])});
        return [tx('share.tog.k.'+g.kind),String(g.count),w.join(', '),(g.codes||[]).join(' '),(g.files||[]).join('\n')]}),false));
      var gb=btn('pro.cf.together',function(){try{LS.set('share.sec','tog')}catch(e){}show('share');var bs=document.querySelectorAll('button[role=tab]'),want=tx('pro.cf.togTab');for(var i=0;i<bs.length;i++)if(bs[i].textContent===want){bs[i].click();break}});gb.setAttribute('data-together','1');
      var gd=el('div');gd.appendChild(gb);gd.appendChild(el('span','hint',' '+tx('pro.cf.togetherH')));o.appendChild(gd)}}
  function mkConf(p){
    p.appendChild(lf('conf.intro',[el('p','hint',tx('pro.cr.intro'))]));
    var g=gameBox(),m=modsBox(),ff=inp(tx('pro.cr.file'),'30%'),o=el('div'),cc=null;
    loadMods(function(){if(!m.input.value)m.input.value=P.mods.join(',')});
    p.appendChild(row('conf.game',[label(tx('pro.game'),g)]));p.appendChild(row('conf.order',[label(tx('pro.cr.order'),m)]));p.appendChild(lf('conf.orderhint',[el('div','hint',tx('pro.cr.orderhint'))]));
    p.appendChild(row('conf.file',[label(tx('pro.cr.file'),nameKit(ff,'pro.conf.file','dirs').el)]));
    // the clean card of the last result is a container of its own after the result (conf.clean), dropped when a new run starts
    p.appendChild(lf('conf.go',[btn('pro.cf.go',function(){note(o,tx('pro.running'));if(cc&&cc.parentNode)cc.parentNode.removeChild(cc);cc=null;api('/api/x/pro/conflicts',{mods:m.input.value,game:g.input.value.trim(),file:ff.value.trim()}).then(function(j){o.textContent='';if(naLine(o,j))return;o.appendChild(lineBox(j.line));
      confSummary(o,j);
      if(j.rows.length){o.appendChild(el('h3',null,tx('pro.cr.who')));
        o.appendChild(table([tx('pro.cr.c.file'),tx('pro.cr.c.key'),tx('pro.cr.c.kind'),tx('pro.cr.c.win'),tx('pro.cr.c.vals')],j.rows.map(function(r){return [r.file,r.key,tx('pro.kind.'+r.kind),r.winner,r.values.map(function(v){return v.src+'='+v.val}).join(' | ')]})))}
      if(j.files&&j.files.length)itemsTable(o,j.files);
      // merge patch: no tool writes one yet
      o.appendChild(el('h3',null,tx('pro.cr.patch')));o.appendChild(el('p','hint',tx('pro.cr.nopatch')));
      if(j.plan.length){o.appendChild(pre(j.plan.join('\n')));o.appendChild(btn('pro.copy',function(){copy(j.plan.join('\n'))}))}
      cc=cleanCard(p,m.input.value,g.input.value.trim())}).catch(function(e){fail(o,e)})},'primary')]));
    p.appendChild(lf('conf.out',[o],'pro.blk.res'));
  }
  function cleanCard(p,mods,game){
    var c=pcard('conf.clean','pro.cl.title','pro.cl.intro');
    var s=h('select',{'aria-label':tx('pro.cl.mod')});mods.split(',').map(function(x){return x.trim()}).filter(Boolean).forEach(function(x){s.appendChild(h('option',{value:x,text:x}))});
    var out=inp(tx('pro.cl.out'),'50%'),outKit=dirKit(out,'pro.clean.out','mod',true),r=el('div'),go=btn('pro.cl.write',function(){
      (typeof askDo==='function'?askDo({title:tx('pro.cl.write'),lines:[tx('pro.cl.confirm',{m:s.value,o:out.value.trim()})],where:out.value.trim()}):{then:function(cb){cb(window.confirm(tx('pro.cl.confirm',{m:s.value,o:out.value.trim()})))}}).then(function(yes){if(!yes)return;note(r,tx('pro.running'));
      api('/api/x/pro/clean',{mods:mods,game:game,mod:s.value,write:true,out:out.value.trim()},{what:tx('pro.job.clean')}).then(function(j){note(r,tx('pro.cl.done',{n:j.wrote,k:j.omitted,o:j.out}))}).catch(function(e){fail(r,e)})})},'primary');
    go.disabled=true;
    c.appendChild(row('conf.clean.mod',[label(tx('pro.cl.mod'),s)]));
    c.appendChild(lf('conf.clean.preview',[btn('pro.cl.preview',function(){go.disabled=true;note(r,tx('pro.running'));api('/api/x/pro/clean',{mods:mods,game:game,mod:s.value}).then(function(j){r.textContent='';if(naLine(r,j))return;
      if(!j.omit.length){r.appendChild(el('p',null,tx('pro.cl.nothing',{k:j.itmKeys})));return}
      r.appendChild(el('p',null,tx('pro.cl.would',{n:j.omit.length,k:j.itmKeys})));r.appendChild(pre(j.omit.join('\n')));go.disabled=false}).catch(function(e){fail(r,e)})})]));
    c.appendChild(row('conf.clean.out',[label(tx('pro.cl.out'),outKit.el)]));c.appendChild(lf('conf.clean.outhint',[el('div','hint',tx('pro.cl.outhint'))]));
    c.appendChild(lf('conf.clean.write',[go]));c.appendChild(lf('conf.clean.res',[r],'pro.blk.res'));
    p.appendChild(c);blkApply(root);return c;
  }

  // ---- E-30 Copy as command
  function mkCopy(p){
    p.appendChild(lf('copy.intro',[el('p','hint',tx('pro.cp.intro'))]));
    var s=h('select',{'aria-label':tx('pro.cp.cmd')});s.appendChild(h('option',{value:'',text:tx('pro.cp.choose')}));
    Object.keys(S.cmds||{}).sort().forEach(function(k){var c=S.cmds[k];if(c.inproc)return;s.appendChild(h('option',{value:k,text:k+(c.title?'  '+c.title:'')}))});
    p.appendChild(row('copy.cmd',[label(tx('pro.cp.cmd'),s)]));var fb=h('div',{blk:'copy.form',box:'col','data-blkname':tx('pro.blk.form')}),o=el('div'),form=null;p.appendChild(fb);
    // the form of the picked command: blocks copy.c.form, copy.c.f.<field>, copy.c.more (one prefix for every command: ids stay code constants)
    s.onchange=function(){fb.textContent='';o.textContent='';form=null;if(!s.value)return;form=buildForm(s.value,{mod:S.mod||undefined},null,'copy.c');fb.appendChild(form.el);
      fb.appendChild(lf('copy.make',[btn('pro.cp.make',function(){api('/api/x/pro/cmdline',{cmd:s.value,input:form.get()}).then(function(j){o.textContent='';
        o.appendChild(el('div','hint',tx('pro.cp.node')));o.appendChild(lineBox(j.node));o.appendChild(el('div','hint',tx('pro.cp.exe')));o.appendChild(lineBox(j.exe));
        if(j.launches)o.appendChild(el('p','err',tx('pro.cp.launches')))}).catch(function(e){fail(o,e)})},'primary')]));blkApply(root)};
    p.appendChild(lf('copy.out',[o],'pro.blk.res'));
  }

  showTab(P.tab);
  return {refresh:function(){first();followMod()},focus:function(){first();followMod()}};
};
`;
