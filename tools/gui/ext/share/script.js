// browser side of the Share page (page.js rules: no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent)
// Author: Imperator_Aug (ARSENAL, ia-98f0aeaa)
// blocks: title, intro, tabs, then one container per section (id = section id), shown one at a time
// the hidden attribute; every part of a section is a leaf "<section>.<part>" or "<section>.<card>.<part>"
module.exports = String.raw`
EXT_SCREENS.share=function(root){
 var T=function(k,p){return tx("share."+k,p)};
 // game parity: the page's game (api() sends it; the routes answer for it). Under GoH the ranges, the develop tag and two help lines differ
 function GID(){try{return (typeof curGame==='function'&&curGame()&&curGame().id)||'as64'}catch(e){return 'as64'}}
 var SECS=['about','gate','pack','ws','ver','play','tog','upd','perm'];
 var cur=LS.get('share.sec','about');if(SECS.indexOf(cur)<0)cur='about';
 var bar=h('div',{class:'row',role:'tablist'}),built={};
 root.appendChild(blk('title',[h('h2',{text:T('title')})]));root.appendChild(blk('intro',[h('div',{class:'hint',text:T('intro')})],{name:T('b.intro')}));
 root.appendChild(blk('tabs',[bar],{name:T('b.tabs')}));
 // block helpers: a leaf around one element the code clears or re-classes (the variable keeps the inner element), a row of buttons,
 // a labelled field with its hint under it, a section container
 function line(id,el,name){return blk(id,[el],{name:name})}
 function btns(id,kids,name){return blk(id,kids,{'class':'row',name:name})}
 function hintB(id,key,name){return blk(id,[h('div',{class:'hint',text:T(key)})],{name:name})}
 function fldH(id,label,ctl,hint,req){var k=[h('label',{class:'f'},[h('span',{class:'n'+(req?' req':''),text:label}),ctl])];if(hint)k.push(h('div',{class:'hint',text:hint}));return blk(id,k,{'class':'fld',name:label})}
 function pane(id){return blk(id,[],{box:'col',name:T('t.'+id)})}
 function pid(box){return box.getAttribute('data-blk')}
 // a block that arrives later goes to the top of its section (before its first block; the profile may have moved that one)
 function atTop(box,el){blkPut(box,el,box.querySelector('[data-blk]'));blkApply(root);return el}
 function noMod(box){box.appendChild(blk(pid(box)+'.nomod',[h('div',{class:'err',text:T('nomod')})],{'class':'card'}));return box}
 function say(el,cls,t){el.className=cls;el.textContent=t}
 // JOBS: a request stopped from the footer (e.cancelled) is no error: the line says Stopped in the plain hint style
 function fail(el){return function(e){if(e&&e.cancelled){say(el,'hint',e.message||'');return}say(el,'err',e.message||String(e))}}
 function kb(n){return Math.max(1,Math.round(n/1024))}
 function names(){return LS.get('share.names',{})}
 function copyText(t,el){try{navigator.clipboard.writeText(t).then(function(){toast(T('copied'))},function(){})}catch(e){}if(el){el.focus();el.select()}}
 function banners(box,r){
  if(r.goh)box.appendChild(h('div',{class:'wzstat err',text:T('goh.warn',{n:r.goh})}));
  if(r.upgraded)box.appendChild(h('div',{class:'wzstat',text:T('perm.upgraded')}))}
 // the warning lines of mod.info at the top of a section, as one leaf (only when there is one)
 function bannerTop(box,r){var b=blk(pid(box)+'.banner',[],{name:T('b.warn')});banners(b,r);if(b.children.length)atTop(box,b)}
 // GT-22: a refused folder is said in the user's language and names both folders
 function refText(rf){var k='refuse.'+(rf&&rf.key||'other');var s=tx('share.'+k,rf&&rf.params||{});return s==='share.'+k?T('refuse.other',{out:(rf&&rf.params&&rf.params.out)||''}):s}
 // searchKit (page.js; owner 2026-11-19: every search box has a manual browse, an indexed search and a history list). The folder and
 // mod-name boxes share one index, read once per mod and game: the picker's start folder (Desktop), this mod and its parent folder,
 // the game folder, the mods in the game's mods folder (by folder and by name). Index rows carry their lowercase text (lo)
 var KN={k:null,d:null,w:[]};
 function known(cb){var k=String(S.mod||'')+'|'+GID();if(KN.k!==k)KN={k:k,d:null,w:[]};if(KN.d){cb(KN.d);return}KN.w.push(cb);if(KN.w.length>1)return;var me=KN,got={};
  function fin(){if(!('m' in got)||!('o' in got))return;var r=got.m||{},mods=r.mods||[],g=String(r.game||''),dirs=[],names=[],seen={};
   function add(p,kind){p=String(p||'');var lo=p.toLowerCase();if(!p||seen[lo])return;seen[lo]=1;dirs.push({label:p.replace(/[\\\/]+$/,'').split(/[\\\/]/).pop()||p,value:p,hint:p+'  ('+T('g.'+kind)+')',lo:lo,kind:kind})}
   add(got.o,'start');if(S.mod){add(S.mod,'mod');add(S.mod.replace(/[\\\/]+$/,'').replace(/[\\\/][^\\\/]*$/,''),'mod')}
   add(g,'game');if(typeof curFolder==='function')add(curFolder(),'game');if(typeof gameDir==='function')add(gameDir(),'game');
   mods.forEach(function(m){if(g)add(g.replace(/[\\\/]+$/,'')+'/mods/'+m.folder,'mods');var nm=m.name||m.folder;names.push({label:nm,value:nm,folder:m.folder,hint:m.folder+(m.version?'  '+m.version:''),lo:(nm+' '+m.folder).toLowerCase()})});
   me.d={dirs:dirs,names:names,game:g,start:got.o||''};me.w.splice(0).forEach(function(f){f(me.d)})}
  api('/api/x/share/mods',undefined,{what:T('job.mods')}).then(function(r){got.m=r;fin()},function(){got.m=null;fin()});
  api('/api/x/share/outstart',undefined,{what:T('job.out')}).then(function(r){got.o=r&&r.dir||'';fin()},function(){got.o='';fin()})}
 function hits(a,q,done){q=String(q||'').toLowerCase();var out=[],n=0;for(var i=0;i<a.length;i++)if(a[i].lo.indexOf(q)>=0){n++;if(out.length<40)out.push(a[i])}done(out,n-out.length)}
 // the game's mods folder (from the mods route, else the page's game folder), '' when there is none
 function modsDir(){var g=KN.d&&KN.d.game||(typeof curFolder==='function'?curFolder():'')||'';return g?String(g).replace(/[\\\/]+$/,'')+'/mods':''}
 // a folder box: kinds = which known folders its index offers; Browse = the folder picker on the disk at the folder in the box, else at
 // at() (out: a folder to write to); a pick puts the folder path in the box
 function dirKit(inp,key,kinds,at,out){return searchKit(inp,{key:key,browse:{mode:'dir',view:'disk',out:!!out,start:function(){return inp.value.trim()||at()}},index:function(q,done){known(function(d){hits(d.dirs.filter(function(x){return kinds.indexOf(x.kind)>=0}),q,done)})}})}
 // GT-22: the picker opens on the Desktop (not the list that starts with the game mods), and a picked folder is checked at once
 function outPick(id){
  var inp=h('input',{type:'text','aria-label':T('out'),placeholder:T('outHint')}),chk=h('div',{class:'hint'});
  function check(){chk.textContent='';if(!inp.value.trim()||!S.mod)return;api('/api/x/share/outcheck',{mod:S.mod,out:inp.value.trim()},{what:T('job.out')}).then(function(x){
   if(x.ok)say(chk,'ok',T('out.ok',{dest:x.dest}));else say(chk,'err',refText(x.refused))}).catch(fail(chk))}
  inp.addEventListener('change',check);
  // the kit's Browse is the folder picker for a folder to write to, at the folder in the box, else the start folder (Desktop, asked
  // once here); a pick sets the box and fires change: checked at once. Index = the start folder, this mod's folders
  var start='';api('/api/x/share/outstart',undefined,{what:T('job.out')}).then(function(x){start=x&&x.dir||''},function(){});
  var kit=dirKit(inp,'share.out',['start','mod'],function(){return start||KN.d&&KN.d.start||''},true);
  kit.browseButton.title=T('choose');
  return {inp:inp,check:check,el:blk(id,[h('label',{class:'f'},[h('span',{class:'n',text:T('out')}),kit.el]),h('div',{class:'hint',text:T('outHint')}),chk],{'class':'fld',name:T('out')})}}
 // GT-23: which mod a section works on, at its top
 function modHead(box){var line=h('div',{class:'wzstat',text:T('mod.which',{name:S.mod.split(/[\\\/]/).pop(),folder:S.mod.split(/[\\\/]/).pop(),path:S.mod})});atTop(box,blk(pid(box)+'.mod',[line],{name:T('b.mod')}));
  api('/api/x/share/info?mod='+encodeURIComponent(S.mod),undefined,{what:T('job.info')}).then(function(r){line.textContent=T('mod.which',{name:r.fields.Name||r.folder,folder:r.folder,path:r.mod})}).catch(function(){});
  return line}
 // ordered mod list (tick + up/down) for Play together and Mods together: one leaf (a list of data rows)
 function modList(id,onReady){
  var st=h('div',{class:'hint',text:T('working')}),tb=h('div'),order=[],on={};
  var box=blk(id,[st,tb],{name:T('b.list')});
  function draw(){tb.textContent='';order.forEach(function(m,i){
   var cb=h('input',{type:'checkbox','aria-label':m.name||m.folder,onchange:function(){on[m.folder]=cb.checked}});cb.checked=!!on[m.folder];
   tb.appendChild(h('div',{class:'row'},[cb,h('span',{text:(m.name||m.folder)+(m.version?' '+m.version:'')+(m.name&&m.name.toLowerCase()!==m.folder?'  ['+m.folder+']':'')}),
    h('button',{type:'button',text:T('list.up'),disabled:i===0,onclick:function(){var t=order[i-1];order[i-1]=order[i];order[i]=t;draw()}}),
    h('button',{type:'button',text:T('list.down'),disabled:i===order.length-1,onclick:function(){var t=order[i+1];order[i+1]=order[i];order[i]=t;draw()}})]))})}
  api('/api/x/share/mods',undefined,{what:T('job.mods')}).then(function(r){
   if(!r.game){say(st,'err',tx('game.notSet'));return}
   order=r.mods.slice();if(!order.length){say(st,'hint',T('list.none'));return}
   st.textContent=T('list.order');st.className='hint';draw();if(onReady)onReady()}).catch(fail(st));
  return {el:box,picked:function(){return order.filter(function(m){return on[m.folder]}).map(function(m){return m.folder})}}}

 // ---- About my mod ----
 function secAbout(){
  var box=pane('about');if(!S.mod)return noMod(box);
  var st=h('div',{class:'hint',text:T('working')}),stw=line('about.st',st,T('b.stat'));box.appendChild(stw);
  api('/api/x/share/info?mod='+encodeURIComponent(S.mod),undefined,{what:T('job.info')}).then(function(r){stw.remove();draw(r)}).catch(fail(st));
  function draw(r){
   var bn=blk('about.banner',[],{name:T('b.warn')});banners(bn,r);if(bn.children.length)box.appendChild(bn);
   if(r.fileId){var nm=names();if(!nm[S.mod]){nm[S.mod]=r.fields.Name;LS.set('share.names',nm)}}
   var F=r.fields;
   var name=h('input',{type:'text',value:F.Name,'aria-label':T('f.name')}),desc=h('textarea',{'aria-label':T('f.desc'),rows:'5'}),ver=h('input',{type:'text',value:F.Version,'aria-label':T('f.ver')});
   desc.value=F.Desc;
   var mn=h('input',{type:'text',value:F.MinGameVersion,'aria-label':T('f.min')}),mx=h('input',{type:'text',value:F.MaxGameVersion,'aria-label':T('f.max')});
   var sel=h('select',{'aria-label':T('range.title')});
   // only the ranges of the page's game (AS64: Classic and Enhanced; MoW:AS2: Classic; GoH: its own version, open end); a range the
   // game does not offer shows as typed numbers
   var rk=Object.keys(r.ranges||{}),goh=r.gid==='goh';
   var initial=rk.indexOf(r.range)>=0?r.range:r.range==='none'?'none':'custom';
   [['none',goh?'range.noneGoh':'range.none']].concat(rk.map(function(k){return [k,'range.'+k]}),[['custom','range.custom']]).forEach(function(o){if(o[0]==='none'&&initial!=='none')return;var op=h('option',{value:o[0],text:T(o[1],r.ranges[o[0]]||{})});if(o[0]===initial)op.selected=true;sel.appendChild(op)});
   var dev=h('input',{type:'checkbox','aria-label':T('range.develop')});dev.checked=!!r.develop;
   var out=h('pre',{class:'log'}),warn=h('div'),stat=h('div',{class:'hint'}),sv=h('button',{type:'button',class:'primary',text:T('about.save'),disabled:true,'data-primary':'1'});
   var rangeRow=blk('about.info.minmax',[],{box:'row',name:T('b.minmax')});
   function sync(){var v=sel.value;if(r.ranges[v]){mn.value=r.ranges[v].min;mx.value=r.ranges[v].max}
    mn.disabled=mx.disabled=(v!=='custom');rangeRow.hidden=(v==='none');dirty()}
   function dirty(){sv.disabled=true;out.textContent='';warn.textContent=''}
   [name,desc,ver,mn,mx].forEach(function(e){e.addEventListener('input',dirty)});sel.addEventListener('change',sync);dev.addEventListener('change',dirty);
   rangeRow.appendChild(fld('about.info.min',T('f.min'),mn));rangeRow.appendChild(fld('about.info.max',T('f.max'),mx));rangeRow.appendChild(hintB('about.info.maxh','f.maxH'));
   function fields(){var o={Name:name.value,Desc:desc.value,Version:ver.value};if(sel.value!=='none'){o.MinGameVersion=mn.value;o.MaxGameVersion=mx.value}return o}
   function ask(write){var b={mod:S.mod,fields:fields(),knownName:names()[S.mod]||'',write:write};if(goh)b.develop=dev.checked;return api('/api/x/share/info',b)}
   var pv=h('button',{type:'button',text:T('about.preview'),onclick:function(){stat.textContent='';ask(false).then(function(x){
     out.textContent='';warn.textContent='';
     if(!x.changes.length){say(stat,'hint',T('about.nochange'));sv.disabled=true;return}
     out.textContent=T('about.will')+'\n'+x.changes.map(function(c){return c.key+': '+(c.from||'-')+'  ->  '+(c.to||'-')}).join('\n');
     if(x.nameChanged)warn.appendChild(h('div',{class:'wzstat err',text:T('about.nameWarn')}));
     if(x.warn.indexOf('name_ascii')>=0)warn.appendChild(h('div',{class:'wzstat',text:T('about.nameAscii')}));
     if(x.warn.indexOf('name_long')>=0)warn.appendChild(h('div',{class:'wzstat',text:T('about.nameLong')}));
     sv.disabled=false}).catch(fail(stat))}});
   sv.onclick=function(){ask(true).then(function(x){sv.disabled=true;say(stat,'ok',T('about.saved',{n:x.changes.length}))}).catch(fail(stat))};
   box.appendChild(card('about.info',[hintB('about.info.intro','about.intro',T('b.intro')),
    fldH('about.info.name',T('f.name'),name,T('f.nameH'),true),
    fldH('about.info.desc',T('f.desc'),desc),
    fldH('about.info.ver',T('f.ver'),ver,T('f.verH')),
    blk('about.info.range',[h('h3',{text:T('range.title')}),h('div',{class:'hint',text:T(goh?'range.helpGoh':'range.help')}),h('div',{class:'row'},[sel])]),rangeRow].concat(goh?[
    blk('about.info.develop',[h('label',{},[dev,' '+T('range.develop')]),h('div',{class:'hint',text:T('range.developH')})],{name:T('range.develop')})]:[],[
    blk('about.info.fileid',[h('div',{class:'hint',text:r.fileId?T('about.fileid',{id:r.fileId}):T('about.nofileid')})]),
    blk('about.info.other',[h('div',{class:'hint',text:T('about.other',{n:r.other.length})})]),
    btns('about.info.btns',[pv,sv],T('b.btns')),line('about.info.stat',stat,T('b.stat')),line('about.info.warn',warn,T('b.warn')),line('about.info.out',out,T('b.res'))]),{name:T('b.info')}));
   sync();sv.disabled=true;
   // credit line helper
   var cm=h('input',{type:'text','aria-label':T('about.creditMod')}),cb=h('input',{type:'text','aria-label':T('about.creditBy')});
   // the credited mod's name: index = the names of the mods in the game's mods folder; Browse = that folder on the disk, a picked mod
   // folder gives its name (from its mod.info, else the folder name)
   var cmKit=searchKit(cm,{key:'share.creditMod',index:function(q,done){known(function(d){hits(d.names,q,done)})},
    browse:{mode:'dir',view:'disk',start:modsDir,toValue:function(p){return String(p||'').replace(/[\\\/]+$/,'').split(/[\\\/]/).pop()}},
    onPick:function(v,it,from){function set(x){cm.value=x;cmKit.remember(x)}if(from!=='browse'){set(v);return}
     known(function(d){var n='';d.names.forEach(function(x){if(!n&&String(x.folder).toLowerCase()===String(v).toLowerCase())n=x.value});set(n||v)})}});
   box.appendChild(card('about.credit',[blk('about.credit.title',[h('h3',{text:T('about.creditT')})]),
    fld('about.credit.mod',T('about.creditMod'),cmKit.el),fld('about.credit.by',T('about.creditBy'),cb),
    btns('about.credit.add',[h('button',{type:'button',text:T('about.creditAdd'),onclick:function(){if(!cm.value.trim()||!cb.value.trim())return;var t=T('about.creditText',{mod:cm.value.trim(),by:cb.value.trim()});desc.value=desc.value?desc.value.replace(/\s+$/,'')+'\n'+t:t;dirty()}})])]));
   // picture
   var pst=h('div',{class:'hint'}),pact=h('div',{class:'row'}),chosen='';
   function pstate(p){if(!p)return say(pst,'hint',T('pic.none'));
    var par={f:p.file,kb:kb(p.size)};
    if(!p.problem)say(pst,'ok',T('pic.ok',par));else say(pst,'err',T(p.problem==='big'?'pic.big':p.problem==='ext'?'pic.ext':'pic.type',par))}
   pstate(r.preview);
   pact.appendChild(h('button',{type:'button',text:T('pic.pick'),onclick:function(){pick('file',S.mod,function(f){chosen=f;pact.querySelectorAll('.use').forEach(function(x){x.remove()});
     api('/api/x/share/preview',{mod:S.mod,from:f},{what:T('job.pic')}).then(function(x){
      if(!x.ok){say(pst,'err',T(x.why==='big'?'pic.badBig':'pic.badType',{kb:kb(x.size)}));return}
      say(pst,'ok',T('pic.ok',{f:x.name,kb:kb(x.size)}));
      pact.appendChild(h('button',{type:'button',class:'primary use',text:T('pic.use'),onclick:function(){api('/api/x/share/preview',{mod:S.mod,from:chosen,write:true}).then(function(y){say(pst,'ok',T('pic.copied',{n:y.name}));pact.querySelectorAll('.use').forEach(function(z){z.remove()})}).catch(fail(pst))}}))}).catch(fail(pst))})}}));
   box.appendChild(card('about.pic',[blk('about.pic.title',[h('h3',{text:T('pic.title')}),h('div',{class:'hint',text:T('pic.help')})]),line('about.pic.stat',pst,T('b.stat')),line('about.pic.btns',pact,T('b.btns'))]));
   blkApply(root)}
  return box}

 // ---- Ready to share? ----
 function secGate(){
  var box=pane('gate');if(!S.mod)return noMod(box);
  var res=h('div'),stat=h('div',{class:'hint'}),deep=h('input',{type:'checkbox'});deep.checked=true;
  // GT-02/GT-18: the crash check row says check's overall result in the user's language (by verdict), the plain finding lines under
  // it, and the tool's own text behind a Details fold
  function checkCell(i){var g=T('gate.g.'+(/^(as64|mowas2|goh)$/.test(i.target||'')?i.target:'as64'));
   var td=h('td',{class:'hint'},[h('div',{text:T('gate.v.'+i.verdict,{n:i.crash||0,game:g})})]);
   if(i.plain&&i.plain.length){td.appendChild(h('div',{text:T('gate.plainHead')}));td.appendChild(h('ul',{},i.plain.map(function(l){return h('li',{text:l})})))}
   if(i.detail||i.full)td.appendChild(h('details',{},[h('summary',{text:T('gate.details')}),h('pre',{class:'log',text:[i.detail,i.full].filter(Boolean).join('\n\n')})]));
   return td}
  var go=h('button',{type:'button',class:'primary','data-primary':'1',text:T('gate.run'),onclick:function(){
   res.textContent='';say(stat,'hint',T('gate.running'));go.disabled=true;
   api('/api/x/share/gate',{mod:S.mod,deep:deep.checked}).then(function(r){
    go.disabled=false;stat.textContent='';
    // N2-8: a mod.info row that only has WARN_* codes is a warning, not a blocker
    r.items.forEach(function(i){if(i.status==='fail'&&i.id==='info'&&i.detail){var codes=i.detail.split('; ').map(function(x){return x.split(' ')[0]});if(codes.every(function(c){return /^WARN_/.test(c)})){i.status='warn';r.fails--}}});
    r.ready=r.fails<=0;
    res.appendChild(h('div',{class:'verdict '+(r.ready?'good':'badx'),text:r.ready?T('gate.ready'):T('gate.notready',{n:r.fails})}));
    var tb=h('tbody');r.items.forEach(function(i){var cls=i.status==='pass'?'good':i.status==='fail'?'badx':i.status==='warn'?'review':'info';
     tb.appendChild(h('tr',{},[h('td',{class:'nw'},[h('span',{class:'badge '+cls,text:T('gate.'+i.status)})]),h('td',{text:T('gate.i.'+i.id)}),i.id==='check'&&i.verdict?checkCell(i):h('td',{class:'hint',text:i.detail})]))});
    res.appendChild(h('table',{},[tb]))}).catch(function(e){go.disabled=false;fail(stat)(e)})}});
  box.appendChild(card('gate.main',[hintB('gate.main.intro','gate.intro',T('b.intro')),blk('gate.main.deep',[h('label',{class:'f chk'},[h('span',{class:'n',text:''}),h('span',{},[deep,' '+T('gate.deep')])])],{'class':'fld'}),
   btns('gate.main.run',[go]),line('gate.main.stat',stat,T('b.stat')),line('gate.main.res',res,T('b.res'))],{name:T('b.main')}));modHead(box);
  api('/api/x/share/info?mod='+encodeURIComponent(S.mod),undefined,{what:T('job.info')}).then(function(r){bannerTop(box,r)}).catch(function(){});
  return box}

 // ---- Package for friends ----
 function secPack(){
  var box=pane('pack');if(!S.mod)return noMod(box);
  var o=outPick('pack.main.out'),res=h('div'),stat=h('div',{class:'hint'});
  function probs(x){if(!x.problems.length)return;
   res.appendChild(h('details',{},[h('summary',{text:T('pack.problemsN',{n:x.problems.length})}),h('pre',{class:'log',text:x.problems.map(function(p){return p.code+'  '+p.where+'  '+p.msg}).join('\n')})]))}
  function show(x,wrote){res.textContent='';
   if(x.refused){say(stat,'err',refText(x.refused));return}
   if(!x.ok){say(stat,'err',T('pack.failed'));probs(x);if(!x.problems.length)res.appendChild(h('details',{},[h('summary',{text:T('pack.details')}),h('pre',{class:'log',text:x.tail})]));return}
   var nm=x.mod.name||x.mod.folder;
   if(wrote)say(stat,'ok',T('pack.done',{dest:x.dest,folder:x.mod.folder}));
   res.appendChild(h('div',{class:'hint',text:T('pack.planned',{name:nm,folder:x.mod.folder})}));
   var lines=[T('pack.item.info',{folder:x.mod.folder})];
   x.plan.forEach(function(p){lines.push(T('pack.item.pak',{folder:x.mod.folder,pak:p.pak,n:p.files,kb:p.kb}))});
   if(x.ownPaks)lines.push(T('pack.item.own',{n:x.ownPaks}));if(x.other)lines.push(T('pack.item.other',{n:x.other}));
   res.appendChild(h('pre',{class:'log',text:x.plan.length||x.ownPaks?lines.join('\n'):T('pack.noplan')}));
   probs(x);
   if(wrote&&x.files){res.appendChild(h('div',{class:'hint',text:T('pack.written')}));res.appendChild(h('pre',{class:'log',text:x.files.map(function(f){return x.mod.folder+'/'+f}).join('\n')}))}}
  function run(write){if(write&&!o.inp.value.trim()){say(stat,'err',T('pack.need'));return}
   say(stat,'hint',T(write?'pack.writing':'working'));api('/api/x/share/package',{mod:S.mod,out:o.inp.value.trim(),write:write},{what:T(write?'job.packw':'job.packp')}).then(function(x){if(!write||x.refused||!x.ok)stat.textContent='';show(x,write)}).catch(fail(stat))}
  box.appendChild(card('pack.main',[hintB('pack.main.intro','pack.intro',T('b.intro')),hintB('pack.main.friend','pack.friend'),btns('pack.main.plan',[h('button',{type:'button',text:T('pack.plan'),onclick:function(){run(false)}})]),o.el,
   btns('pack.main.write',[h('button',{type:'button',class:'primary',text:T('pack.write'),onclick:function(){run(true)}})]),line('pack.main.stat',stat,T('b.stat')),line('pack.main.res',res,T('b.res'))],{name:T('b.main')}));
  modHead(box);
  api('/api/x/share/info?mod='+encodeURIComponent(S.mod),undefined,{what:T('job.info')}).then(function(r){bannerTop(box,r)}).catch(function(){});
  return box}

 // the Workshop uploader (workshop_gui): is it in the game folder, put it there (list first, then confirm), open it
 function upCard(){
  var gi=h('input',{type:'text','aria-label':T('up.game'),placeholder:T('up.game')}),st=h('div',{class:'hint'}),list=h('div'),msg=h('div',{class:'hint'}),row=h('div',{class:'row'});
  // the game folder box: index = the game folders the GUI knows, Browse = the folder picker
  var giKit=dirKit(gi,'share.upGame',['game'],function(){return typeof curFolder==='function'?curFolder()||'':''});
  function g(){return gi.value.trim()}
  function draw(x){st.textContent='';list.textContent='';row.textContent='';
   say(st,x.installed&&x.upToDate?'ok':'hint',T(!x.installed?'up.no':x.upToDate?'up.yes':'up.old',{game:x.gameName,dir:x.dir}));
   if(x.todo){var steps=x.steps.map(function(s){return T('up.a.'+s.action,{file:s.file,id:x.appid})});
    steps.forEach(function(t){list.appendChild(h('div',{class:'hint',text:t}))});
    list.appendChild(h('div',{class:'hint',text:T('up.dll')}));
    if(!x.hasPackage)list.appendChild(h('div',{class:'wzstat err',text:T('up.nopack')}));
    else{var ib=h('button',{type:'button',class:x.installed?'':'primary',text:T('up.install'),onclick:function(){
      askDo({title:T('up.install'),lines:steps.concat([T('up.dll')]),where:x.dir,ok:T('up.confirm'),danger:true}).then(function(yes){if(!yes)return;
       ib.disabled=true;say(msg,'hint',T('working'));api('/api/x/share/uploader',{act:'install',confirm:true,game:g()},{what:T('job.upinst')}).then(function(y){draw(y);say(msg,'ok',y.done&&y.done.length?T('up.done',{list:y.done.join(', ')}):T('up.nothing'))}).catch(function(e){ib.disabled=false;fail(msg)(e)})})}});
     row.appendChild(ib)}}
   if(x.installed)row.appendChild(h('button',{type:'button',class:'primary',text:T('up.open'),onclick:function(){
    api('/api/x/share/uploader',{act:'start',game:g()}).then(function(){say(msg,'ok',T('up.opened'))}).catch(fail(msg))}}));
   row.appendChild(h('button',{type:'button',text:T('up.check'),onclick:load}))}
  function load(){msg.textContent='';list.textContent='';row.textContent='';say(st,'hint',tx('ui.checking'));api('/api/x/share/uploader'+(g()?'?game='+encodeURIComponent(g()):''),undefined,{what:T('job.up')}).then(draw).catch(function(e){list.textContent='';row.textContent='';row.appendChild(h('button',{type:'button',text:T('up.check'),onclick:load}));fail(st)(e)})}
  gi.addEventListener('change',load);load();
  return card('ws.up',[blk('ws.up.title',[h('b',{text:T('up.h')})]),line('ws.up.st',st,T('b.stat')),line('ws.up.list',list,T('b.steps')),line('ws.up.btns',row,T('b.btns')),line('ws.up.msg',msg,T('b.msg')),line('ws.up.game',giKit.el,T('up.game'))],{name:T('up.h')})}

 // ---- Workshop ----
 function secWs(){
  var box=pane('ws');if(!S.mod)return noMod(box);
  var o=outPick('ws.make.out'),res=h('div'),stat=h('div',{class:'hint'}),wbox=h('div');
  var ol=h('ol');['c1','c2','c3','c4','c5','c6'].forEach(function(k){ol.appendChild(h('li',{text:T('ws.'+k)}))});
  function counts(x){res.textContent='';wbox.textContent='';
   x.warns.forEach(function(w){wbox.appendChild(h('div',{class:'wzstat err',text:T('ws.w.'+w)}))});
   res.appendChild(h('div',{class:'hint',text:T('ws.counts',{n:x.files,kb:kb(x.bytes),list:x.left_out.length?x.left_out.slice(0,12).join(', '):T('ws.nothingLeft')})}))}
  function call(write){return api('/api/x/share/workshop',{mod:S.mod,out:o.inp.value.trim(),write:write,knownName:names()[S.mod]||''},{what:T(write?'job.wsw':'job.wsp')})}
  box.appendChild(card('ws.help',[hintB('ws.help.intro','ws.intro',T('b.intro')),hintB('ws.help.where','ws.where'),blk('ws.help.steps',[ol],{name:T('b.steps')})].concat(GID()==='goh'?[hintB('ws.help.gohTags','ws.gohTags')]:[],[
   blk('ws.help.friend',[h('b',{text:T('ws.friendH')}),h('div',{class:'hint',text:T('ws.friend')})])]),{name:T('b.help')}));
  box.appendChild(line('ws.notes',wbox,T('b.warn')));modHead(box);
  box.appendChild(upCard());
  box.appendChild(card('ws.make',[o.el,btns('ws.make.btns',[
   h('button',{type:'button',text:T('ws.plan'),onclick:function(){stat.textContent='';call(false).then(counts).catch(fail(stat))}}),
   h('button',{type:'button',class:'primary',text:T('ws.make'),onclick:function(){if(!o.inp.value.trim()){say(stat,'err',T('pack.need'));return}
    call(true).then(function(x){counts(x);say(stat,'ok',T('ws.done',{out:x.out}))}).catch(fail(stat))}})],T('b.btns')),line('ws.make.stat',stat,T('b.stat')),line('ws.make.res',res,T('b.res'))],{name:T('b.main')}));
  api('/api/x/share/info?mod='+encodeURIComponent(S.mod),undefined,{what:T('job.info')}).then(function(r){bannerTop(box,r)}).catch(function(){});
  call(false).then(counts).catch(function(){});
  return box}

 // ---- New version ----
 function secVer(){
  var box=pane('ver');if(!S.mod)return noMod(box);
  var now=h('div',{class:'hint'}),kind='patch',note=h('textarea',{rows:'3','aria-label':T('ver.note')}),prev=h('input',{type:'text','aria-label':T('ver.prev')}),res=h('div'),stat=h('div',{class:'hint'});
  // the previous version's folder: index = the mods in the game's mods folder and this mod's folders, Browse = the folder picker
  var prevKit=dirKit(prev,'share.verPrev',['mods','mod'],function(){return S.mod||''});
  prevKit.browseButton.title=T('choose');
  var kinds=blk('ver.main.kind',[],{'class':'row',name:T('b.kind')});
  ['patch','minor','major'].forEach(function(k,i){var rb=h('input',{type:'radio',name:'share-ver-kind',value:k,onchange:function(){kind=k}});if(i===0)rb.checked=true;kinds.appendChild(h('label',{},[rb,' '+T('ver.'+k)+'   ']))});
  function since(){return LS.get('share.since.'+S.mod,0)}
  function ask(write){return api('/api/x/share/version',{mod:S.mod,kind:kind,note:note.value,prev:prev.value.trim(),since:since(),write:write},{what:T(write?'job.verw':'job.verp')})}
  function view(x,wrote){res.textContent='';
   res.appendChild(h('div',{class:'wzstat',text:T('ver.will',{a:x.old||T('ver.none'),b:x.next})}));
   res.appendChild(h('div',{class:'hint',text:x.basis==='copy'?T('ver.changed',{n:x.changed.length}):x.basis==='time'?T('ver.basisTime')+' '+T('ver.changed',{n:x.changed.length}):T('ver.basisNone')}));
   if(x.changed.length){var lab={'new':'ver.new',changed:'ver.changedS',removed:'ver.removed'};res.appendChild(h('pre',{class:'log',text:x.changed.map(function(c){return T(lab[c.status])+'  '+c.path}).join('\n')+(x.more?'\n... +'+x.more:'')}))}
   res.appendChild(h('div',{class:'hint',text:T('ver.noteHead')}));var ta=h('textarea',{rows:'3',readonly:true});ta.value=x.noteText;res.appendChild(ta);
   res.appendChild(h('button',{type:'button',text:T('copy'),onclick:function(){copyText(x.noteText,ta)}}));
   if(wrote){LS.set('share.since.'+S.mod,x.now);say(stat,'ok',T('ver.done',{v:x.next}))}}
  api('/api/x/share/info?mod='+encodeURIComponent(S.mod),undefined,{what:T('job.info')}).then(function(r){now.textContent=T('ver.now',{v:r.fields.Version||T('ver.none')});bannerTop(box,r)}).catch(fail(now));
  box.appendChild(card('ver.main',[hintB('ver.main.intro','ver.intro',T('b.intro')),line('ver.main.now',now,T('b.now')),kinds,
   fld('ver.main.note',T('ver.note'),note),
   fld('ver.main.prev',T('ver.prev'),prevKit.el),
   btns('ver.main.btns',[h('button',{type:'button',text:T('ver.show'),onclick:function(){stat.textContent='';prevKit.remember();ask(false).then(function(x){view(x,false)}).catch(fail(stat))}}),
    h('button',{type:'button',class:'primary',text:T('ver.bump'),onclick:function(){ask(true).then(function(x){view(x,true);now.textContent=T('ver.now',{v:x.next})}).catch(fail(stat))}})],T('b.btns')),
   line('ver.main.stat',stat,T('b.stat')),line('ver.main.res',res,T('b.res'))],{name:T('b.main')}));modHead(box);
  return box}

 // ---- Play together ----
 function secPlay(){
  var box=pane('play'),active=h('input',{type:'checkbox'}),res=h('div'),stat=h('div',{class:'hint'});active.checked=true;
  var ml=modList('play.main.list');
  box.appendChild(card('play.main',[hintB('play.main.intro','play.intro',T('b.intro')),blk('play.main.active',[h('label',{},[active,' '+T('play.useActive')])]),hintB('play.main.hint','play.pickHint'),ml.el,
   btns('play.main.make',[h('button',{type:'button',class:'primary','data-primary':'1',text:T('play.make'),onclick:function(){
    res.textContent='';say(stat,'hint',T('working'));
    var picked=ml.picked();api('/api/x/share/card',{mods:(!active.checked&&picked.length)?picked:[]}).then(function(x){stat.textContent='';
     if(x.source==='profile')res.appendChild(h('div',{class:'hint',text:T('play.src.profile')}));
     if(x.missing.length)res.appendChild(h('div',{class:'err',text:T('play.missing',{l:x.missing.join(', ')})}));
     var ta=h('textarea',{rows:String(Math.min(16,x.text.split('\n').length+1)),readonly:true});ta.value=x.text;res.appendChild(ta);
     res.appendChild(h('button',{type:'button',text:T('copy'),onclick:function(){copyText(x.text,ta)}}));res.appendChild(h('div',{class:'hint',text:T('play.rule')}));
     if(x.syncNa)res.appendChild(h('div',{class:'wzstat','data-na':'share.play.gohSync',text:tx('na.line',{g:curGame().name,why:T('play.gohSync')})}))}).catch(fail(stat))}})]),
   line('play.main.stat',stat,T('b.stat')),line('play.main.res',res,T('b.res'))],{name:T('b.main')}));
  return box}

 // ---- Mods together ----
 // Guided fix: the clashes route answers groups (one per kind, most harmful first), each clash with who wins, what is lost and its
 // ways out (fix.last / fix.patch / fix.hand). A way out is only marked here (LS, per game and mod set); the patch mod card sends
 // the marked ones to clashfix: Preview (nothing written), then Write into a NEW folder, then the check again with that folder on top.
 // One code for the three game tabs; Gates of Hell differs in one place: no text pick (the route sends fix.hand for it)
 function secTog(){
  var box=pane('tog'),res=h('div'),stat=h('div',{class:'hint'}),ml=modList('tog.main.list');
  var cur=null,curMods=[],curPatch='',tried=false,planned=false,picks={},filt='',gbox=null,fcount=null,openG={};
  var out=h('input',{type:'text','aria-label':T('tog.fix.out')}),pname=h('input',{type:'text','aria-label':T('tog.fix.name')});
  var fstat=h('div',{class:'hint'}),fres=h('div'),prog=h('div',{class:'wzstat','data-prog':'1'});
  function B(t,fn,tip,cls){var b=h('button',{type:'button',text:t,onclick:fn});if(tip)b.title=tip;if(cls)b.className=cls;return b}
  function setKey(){return GID()+'|'+curMods.slice().sort().join('|')}
  function marks(){var s=LS.get('share.tog.marks',null);return s&&s.k===setKey()&&s.m?s.m:{}}
  function saveMarks(m){LS.set('share.tog.marks',{k:setKey(),m:m});setPlanned(false);drawProg()}
  function setPlanned(v){planned=!!v;wb.disabled=!planned}
  function setMark(id,v){var m=marks();if(v)m[id]=v;else delete m[id];saveMarks(m)}
  function each(fn){(cur&&cur.groups||[]).forEach(function(g){g.items.forEach(fn)})}
  function drawProg(){if(!cur||!cur.total){prog.textContent='';prog.hidden=true;return}var m=marks(),n=0;each(function(c){if(m[c.id])n++});prog.hidden=false;prog.textContent=T('tog.prog',{n:n,m:cur.total})}
  function whyText(c){c=String(c||'').replace('VFS_','');if(c==='MOD_VER_GATE')c='MOD_VERSION';var k='share.tog.why.'+c,s=tx(k);return s===k?T('tog.why.other'):s}
  function unq(s){s=String(s||'');return s.length>=2&&s.charAt(0)==='"'&&s.charAt(s.length-1)==='"'?s.slice(1,-1):s}
  function inList(m){m=String(m||'').toLowerCase();return curMods.some(function(x){return x.toLowerCase()===m})}
  function rid(){var s='r',c='abcdefghijklmnopqrstuvwxyz0123456789';for(var i=0;i<12;i++)s+=c.charAt(Math.floor(Math.random()*c.length));return s}
  function stepText(p){var k='share.tog.step.'+p.step,s=tx(k);if(s===k)s=T('working');return p.total>0?T('tog.progOf',{s:s,a:p.done,b:p.total}):s}
  // a long request: its step and "files done of total" on the status line (asked 2-3 times a second from the progress route, which
  // reads what the tool writes while it runs) and a Stop button (the request is dropped; the server stops the tool when the page goes)
  function longRun(el,url,body,what,then){
   if(el._stop)el._stop();
   var id=rid(),me=(typeof AbortController==='function')?new AbortController():null,txt=h('span',{text:T('working')+' '}),live=true,tm=null;
   body.run=id;el.className='hint';el.textContent='';el.appendChild(txt);
   function end(){live=false;if(tm)clearInterval(tm);tm=null;if(el._stop===halt)el._stop=null}
   function halt(){if(!live)return;end();if(me){try{me.abort()}catch(e){}}}
   el._stop=halt;
   // the Stop button goes in after the request is sent: api() holds every button of the clicked card while a POST runs (page.js holdCard)
   var sb=me?h('button',{type:'button','data-stop':'1',text:T('tog.stop'),onclick:function(){halt();say(el,'hint',T('tog.stopped'))}}):null;
   function poll(){if(!live)return;api('/api/x/share/clashprogress?run='+id+'&wait=1',undefined,{job:false}).then(function(p){if(live&&p&&p.step)txt.textContent=stepText(p)+' '}).catch(function(){})}
   if(typeof setInterval==='function')tm=setInterval(poll,400);
   api(url,body,me?{what:what,signal:me.signal}:{what:what}).then(function(x){if(!live)return;end();el.textContent='';then(x)}).catch(function(e){if(!live)return;end();fail(el)(e)});
   if(sb&&live)el.appendChild(sb)}
  function run(p,isTry,patch,fresh){
   res.textContent='';var b={mods:p};if(patch)b.patch=patch;if(fresh)b.fresh=true;
   longRun(stat,'/api/x/share/clashes',b,T('job.tog'),function(x){cur=x;curMods=p;curPatch=patch||'';tried=!!isTry;picks={};filt='';setPlanned(false);draw(x)})}
  function add(cls,t,mark){var e=h('div',{class:cls,text:t});if(mark)e.setAttribute('data-'+mark,'1');res.appendChild(e);return e}
  // playing online: one plain result at the top (its own request: the lobby check reads each mod once more)
  function drawMp(el){
   el.appendChild(h('b',{text:T('tog.mp.head')}));var body=h('div',{class:'hint',text:T('tog.mp.wait')});el.appendChild(body);
   var b={mods:curMods},mine=cur;if(curPatch)b.patch=curPatch;
   api('/api/x/share/clashmp',b,{what:T('job.togmp')}).then(function(r){if(cur!==mine)return;body.textContent='';body.className='';
    function ln(cls,t){body.appendChild(h('div',{class:cls,text:t}))}
    ln('ok',T('tog.mp.ok',{l:curMods.join(', ')}));
    if(r.patch)ln('hint',T('tog.mp.patch',{p:r.patch,n:r.patchFiles||0}));else ln('hint',T('tog.mp.patchIf'));
    if(r.gid==='goh')ln('hint',T('tog.mp.goh'));
    (r.sizeOnly||[]).forEach(function(s){ln('hint',T('tog.mp.size',{m:s.mod,n:s.n}))});
    (r.actions||[]).forEach(function(a){ln('err',T('tog.mp.actions',{m:a.mod,n:a.n}))});
    if(r.gid!=='goh'&&!r.checked)ln('hint',T('tog.mp.unchecked'))}).catch(function(e){if(cur!==mine)return;fail(body)(e)})}
  function winsText(w){return Object.keys(w||{}).map(function(m){return m+': '+w[m]}).join(', ')}
  // how long it took, the same result again (nothing changed) with a way to check from scratch, and the whole-file list on request
  function tail(x){
   var row=h('div',{class:'row','data-tail':'1'}),sh=h('div');
   row.appendChild(h('span',{class:'hint',text:T(x.kept?'tog.kept':'tog.took',{s:String(Math.round((x.ms||0)/100)/10)})}));
   if(x.kept)row.appendChild(B(T('tog.fresh'),function(){run(curMods,tried,curPatch,true)}));
   row.appendChild(B(T('tog.shadowBtn'),function(){say(sh,'hint',T('working'));
    api('/api/x/share/clashshadows',{mods:curMods},{what:T('job.tog')}).then(function(r){sh.className='';sh.textContent='';
     if(!r.shadows||!r.shadows.length){say(sh,'hint',T('tog.shadowNone'));return}
     sh.appendChild(h('h3',{text:T('tog.shadows')}));sh.appendChild(h('div',{class:'hint',text:T('tog.shadowHelp')}));
     sh.appendChild(h('pre',{class:'log',text:r.shadows.map(function(s){return s.file+'  '+s.msg}).join('\n')}));
     if(r.more)sh.appendChild(h('div',{class:'hint',text:T('tog.more',{n:r.more})}))}).catch(fail(sh))},T('tog.shadowH')));
   res.appendChild(row);res.appendChild(sh)}
  function draw(x){
   res.textContent='';
   var mp=add('wzstat','','mp');drawMp(mp);
   if(tried){add('wzstat',T('tog.try',{o:curMods.join(', ')}),'try');add('hint',T(GID()==='goh'?'tog.lastWhereGoh':'tog.lastWhere'),'where')}
   if(x.patch)add('hint',T('tog.withPatch',{p:x.patch}),'patch');
   (x.sameMod||[]).forEach(function(s){add('err',T('tog.sameMod',{a:s.a,b:s.b}),'same')});
   if(x.compared===undefined||x.compared>=2)add('hint',T('tog.winner',{m:x.winner}));
   if(x.skipped&&x.skipped.length){var sl=x.skipped.map(function(s){return s.mod}).join(', ');
    add('err',x.gate==='as64'?T('tog.refusedAs64',{l:sl}):T('tog.skipped',{g:curGame().name,l:sl}),'skip');
    if(x.compared<2){add('hint',T('tog.fewer'));drawProg();return}}
   (x.notes||[]).forEach(function(n){add('hint',T('tog.note.'+n.kind,{m:n.mod,n:n.n,w:n.where}),'note')});
   if(x.clean){add('verdict good',T(x.patch?'tog.noneLeft':'tog.none'));if(x.decided)add('hint',T('tog.decided',{n:x.decided}));tail(x);drawProg();return}
   if(x.decided)add('hint',T('tog.decided',{n:x.decided}));
   if(x.twice&&x.twice.length)add('hint',T('tog.twice',{l:x.twice.map(function(t){return t.file+' ('+t.mod+')'}).join(', ')}));
   if(winsText(x.wins))add('hint',T('tog.wins',{l:winsText(x.wins)}),'wins');
   res.appendChild(prog);
   if(x.groups&&x.groups.length){res.appendChild(h('h3',{text:T('tog.head')}));res.appendChild(filterBox());gbox=h('div');res.appendChild(gbox);drawGroups()}
   tail(x);drawProg()}
  // the filter over every clash: searchKit (browse, index = the files that clash, history); the groups show only what matches
  function filterBox(){
   var inp=h('input',{type:'text','aria-label':T('tog.filter'),placeholder:T('tog.filter')}),idx=[],seen={};
   each(function(c){if(seen[c.file])return;seen[c.file]=1;idx.push({label:c.file,value:c.file,hint:T('tog.k.'+c.kind),lo:c.file.toLowerCase()})});
   var kit=searchKit(inp,{key:'share.tog.q',index:function(q,done){hits(idx,q,done)}});
   function go(){var v=inp.value.trim().toLowerCase();if(v===filt)return;filt=v;drawGroups()}
   inp.addEventListener('input',go);inp.addEventListener('change',go);
   fcount=h('span',{class:'hint','data-fcount':'1'});
   return h('div',{class:'row','data-filter':'1'},[kit.el,fcount])}
  function match(c){return !filt||c.file.toLowerCase().indexOf(filt)>=0||String(c.other||'').toLowerCase().indexOf(filt)>=0||String(c.keys&&c.keys[0]&&c.keys[0].key||'').toLowerCase().indexOf(filt)>=0}
  function drawGroups(){if(!gbox)return;gbox.textContent='';var shown=0,all=0;
   cur.groups.forEach(function(g){var items=g.items.filter(match);all+=g.items.length;shown+=items.length;if(items.length)gbox.appendChild(drawGroup(g,items))});
   if(fcount)fcount.textContent=filt?T('tog.filterN',{n:shown,m:all}):'';
   if(filt&&!shown)gbox.appendChild(h('div',{class:'hint','data-nomatch':'1',text:T('tog.filterNone')}))}
  // the mark a way out leaves on a clash; null = that way does not fit this clash. fix.key = the file that goes into the patch mod
  // when it is not the clash's own file (a joint view clash: the other mod's file that causes it)
  function markOf(c,how){var key=c.fix.key||c.file;
   if(how==='leave')return {how:'leave'};
   if(how==='merge')return c.fix.patch==='merge'?{how:'merge',key:key}:null;
   if(how==='prefer')return c.fix.patch==='merge'&&(c.kind==='value'||c.kind==='text'||c.kind==='macro')?{how:'prefer',m:c.loser,key:key}:null;
   if(how==='take')return c.fix.patch==='take'?{how:'take',m:c.loser,key:key}:null;
   return null}
  // one kind: a fold (open while it is short or was opened), who wins how often, "all in this group the same way", 15 clashes at a time
  function drawGroup(g,items){
   var open=!!filt||g.count<=30||!!openG[g.kind],sec=h('details',{class:'card','data-kind':g.kind}),list=h('div'),shown=0,filled=false;
   if(open)sec.setAttribute('open','');
   sec.appendChild(h('summary',{},[h('h4',{style:'display:inline',text:T('tog.k.'+g.kind)+'  ('+(filt?items.length+' / ':'')+g.count+')'})]));
   sec.appendChild(h('div',{class:'hint',text:T('tog.k.'+g.kind+'.what')}));
   if(winsText(g.wins))sec.appendChild(h('div',{class:'hint','data-gwins':'1',text:T('tog.wins',{l:winsText(g.wins)})}));
   function bulk(fn){return function(){var m=marks(),n=0;items.forEach(function(c){var k=fn(c);if(k===undefined)return;n++;if(k)m[c.id]=k;else delete m[c.id]});saveMarks(m);openG[g.kind]=true;drawGroups();toast(T('tog.all.done',{n:n}))}}
   if(items.length>1){var br=h('div',{class:'row','data-bulk':'1'},[h('span',{class:'hint',text:T('tog.all',{n:items.length})})]),losers=[];
    items.forEach(function(c){if(c.loser&&losers.indexOf(c.loser)<0&&(markOf(c,'prefer')||markOf(c,'take')))losers.push(c.loser)});
    if(items.some(function(c){return markOf(c,'merge')}))br.appendChild(B(T('tog.b.both'),bulk(function(c){return markOf(c,'merge')||undefined})));
    losers.slice(0,4).forEach(function(m){br.appendChild(B(T(g.kind==='file'||g.kind==='jointparse'?'tog.b.take':'tog.b.prefer',{m:m}),bulk(function(c){return c.loser===m?(markOf(c,'prefer')||markOf(c,'take')||undefined):undefined})))});
    br.appendChild(B(T('tog.b.leave'),bulk(function(c){return markOf(c,'leave')})));br.appendChild(B(T('tog.b.undo'),bulk(function(){return null})));
    sec.appendChild(br)}
   sec.appendChild(list);
   var mb=B('',function(){more()});
   function more(){var end=Math.min(items.length,shown+15);for(;shown<end;shown++)list.appendChild(drawItem(items[shown]));mb.hidden=shown>=items.length;mb.textContent=T('tog.showMore',{n:items.length-shown})}
   function fill(){if(filled)return;filled=true;more()}
   sec.appendChild(mb);mb.hidden=true;
   if(open)fill();
   sec.addEventListener('toggle',function(){if(sec.open===false){openG[g.kind]=false;return}openG[g.kind]=true;fill()});
   if(g.more)sec.appendChild(h('div',{class:'hint',text:T('tog.more',{n:g.more})}));
   return sec}
  function drawItem(c){
   var w=c.winner,l=c.loser,k0=c.keys&&c.keys[0]||{};
   var el=h('div',{class:'wzstat','data-clash':c.id}),st=h('div',{class:'ok'}),bt=h('div',{class:'row'});
   el.appendChild(h('div',{},[h('b',{text:c.file+(c.line?':'+c.line:'')})]));
   var now=T('tog.now.'+c.kind,{w:w,l:l,n:c.n,k:k0.key||'',o:c.other+(c.otherLine?':'+c.otherLine:''),t:c.what?T('tog.what.'+c.what):''});
   if(c.kind==='notloaded')now=now+' '+whyText(c.why);
   el.appendChild(h('div',{text:T('tog.nowL')+' '+now}));
   if(['macro','lost','textlost','value','text'].indexOf(c.kind)>=0&&c.keys.length)el.appendChild(h('div',{class:'hint',text:T('tog.sample')+' '+c.keys.map(function(k){
    return k.key+(k.values&&k.values.length?' ('+k.values.map(function(v){return v.src+' = '+v.val}).join(', ')+')':'')}).join('; ')}));
   el.appendChild(h('div',{},[h('b',{text:T('tog.howL')})]));
   if(c.fix.hand)el.appendChild(h('div',{class:'hint','data-hand':'1',text:T('tog.hand.'+c.kind+(c.game?'Game':''),{w:w,l:l,f:c.file,n:c.line||1,o:c.other,on:c.otherLine,k:k0.key||''})}));
   function mark(v){return function(){setMark(c.id,v);refresh()}}
   function refresh(){var m=marks()[c.id];bt.textContent='';
    if(m){st.textContent=m.how==='leave'?T('tog.s.left'):T('tog.s.patch',{how:T('tog.fix.how.'+m.how,{m:m.m||''})});el.setAttribute('data-done',m.how);bt.appendChild(B(T('tog.b.undo'),mark(null)));return}
    st.textContent='';el.removeAttribute('data-done');
    if(c.fix.key&&c.fix.patch==='merge')bt.appendChild(B(T('tog.b.restore',{f:c.fix.key}),mark(markOf(c,'merge'))));
    else if(c.fix.key&&c.fix.patch==='take')bt.appendChild(B(T('tog.b.restoreOf',{f:c.fix.key,m:l}),mark(markOf(c,'take'))));
    else{
     if(c.fix.patch==='merge'){bt.appendChild(B(T('tog.b.both'),mark(markOf(c,'merge'))));
      if(markOf(c,'prefer'))bt.appendChild(B(T('tog.b.prefer',{m:l}),mark(markOf(c,'prefer'))))}
     if(c.fix.patch==='take')bt.appendChild(B(T('tog.b.take',{m:l}),mark(markOf(c,'take'))))}
    if(c.fix.patch==='text')(k0.values||[]).forEach(function(v){bt.appendChild(B(T('tog.b.text',{m:v.src}),mark({how:'text',m:v.src,key:k0.key,text:unq(v.val)})))});
    if(c.fix.last&&inList(c.fix.last))bt.appendChild(B(T('tog.b.last',{m:c.fix.last}),function(){var lo=c.fix.last.toLowerCase(),o=curMods.filter(function(m){return m.toLowerCase()!==lo}),me=curMods.filter(function(m){return m.toLowerCase()===lo});run(o.concat(me),true)},T('tog.b.lastH')));
    bt.appendChild(B(T('tog.b.leave'),mark({how:'leave'})))}
   refresh();el.appendChild(bt);el.appendChild(st);return el}
  // what goes to the patch mod: the marked clashes that are still in the answer, one entry per file
  function spec(){var m=marks(),files={},texts=[];
   each(function(c){var k=m[c.id];if(!k||k.how==='leave')return;
    if(k.how==='text'){texts.push({key:k.key,text:k.text});return}
    var f=files[k.key]||(files[k.key]={key:k.key,mode:'merge'});
    if(k.how==='take'){f.mode='take';f.take=k.m}
    if(k.how==='prefer')f.prefer=k.m;
    if(picks[k.key])f.picks=picks[k.key]});
   return {files:Object.keys(files).map(function(k){return files[k]}),texts:texts}}
  function fix(write){
   var s=spec();if(!cur||(!s.files.length&&!s.texts.length)){say(fstat,'err',T('tog.fix.none'));return}
   if(!out.value.trim()){say(fstat,'err',T('tog.fix.needOut'));return}
   if(write&&!planned){say(fstat,'err',T('tog.fix.dirty'));return}
   longRun(fstat,'/api/x/share/clashfix',{mods:curMods,out:out.value.trim(),name:pname.value.trim(),files:s.files,texts:s.texts,write:!!write},T('job.togfix'),function(r){showPlan(r,write)})}
  // the tool's lines as words of this language: each file row carries parts [{k,n,m,w,a,b}]; an unknown part falls back to the tool's line
  function whatText(f){var a=(f.parts||[]).map(function(p){var k='share.tog.fix.p.'+p.k,s=tx(k,p);return s===k?'':s}).filter(Boolean);
   if(a.length)return a.join('; ');return f.same?T('tog.fix.same'):(f.what||[]).join('; ')}
  function cantText(c){var k='share.tog.fix.c.'+(c.k||'-'),s=tx(k,c.p||{});return s===k?String(c.why||''):s}
  // one file of the patch mod as before and after: an entry per row, what each mod has, what the patch mod will hold and why
  function viewOf(f){
   var low=curMods.map(function(m){return m.toLowerCase()}),rows=[];
   function vals(list){var o={};(list||[]).forEach(function(v){o[String(v.src).toLowerCase()]=v.val});return o}
   (f.added||[]).forEach(function(a){if(a.val===undefined)return;var o={};o[String(a.from).toLowerCase()]=a.val;rows.push({p:a.path,v:o,r:a.val,from:a.from,tag:'added'})});
   (f.auto||[]).forEach(function(a){rows.push({p:a.path,v:vals(a.values),r:a.val,from:a.from,tag:'only'})});
   (f.choices||[]).forEach(function(c){var o=vals(c.values);rows.push({p:c.path,v:o,r:o[String(c.pick).toLowerCase()],from:c.pick,tag:picks[f.key]&&picks[f.key][c.path]?'picked':'last'})});
   if(!rows.length&&!f.sizes)return null;
   var d=h('details',{'data-view':f.key},[h('summary',{text:T('tog.fix.view')})]);
   if(f.sizes)d.appendChild(h('div',{class:'hint',text:f.sizes.map(function(s){return T('tog.fix.sizes',{m:s.src,n:kb(s.bytes)})}).join(', ')}));
   if(rows.length){var hr=h('tr',{},[h('th',{text:T('tog.fix.col.entry')})]),tb=h('tbody');
    curMods.forEach(function(m){hr.appendChild(h('th',{text:m}))});hr.appendChild(h('th',{text:T('tog.fix.col.result')}));tb.appendChild(hr);
    rows.slice(0,200).forEach(function(r){var tr=h('tr',{'data-row':r.tag},[h('td',{text:r.p})]),from=String(r.from).toLowerCase();
     low.forEach(function(m){var v=r.v[m];tr.appendChild(h('td',{class:from===m?'ok':'hint',text:v===undefined?T('tog.fix.absent'):v}))});
     tr.appendChild(h('td',{},[h('b',{text:r.r===undefined?'':r.r}),h('span',{class:'hint',text:'  '+T('tog.fix.tag.'+r.tag,{m:r.from})})]));tb.appendChild(tr)});
    d.appendChild(h('div',{class:'scroll'},[h('table',{},[tb])]));
    if(rows.length>200)d.appendChild(h('div',{class:'hint',text:T('tog.fix.moreRows',{n:rows.length-200})}))}
   return d}
  function showPlan(r,write){
   fres.textContent='';
   if(r.refused&&!r.wrote){fres.appendChild(h('div',{class:'err','data-refused':'1',text:T('tog.fix.refused',{why:r.refused})}));setPlanned(false);return}
   var nw=r.files.filter(function(f){return !f.same}).length;
   fres.appendChild(h('div',{class:write?'ok':'hint','data-plan':write?'wrote':'plan',text:T(write?'tog.fix.wrote':'tog.fix.planHead',{n:nw,o:r.out})}));
   if(write){
    fres.appendChild(h('div',{class:'hint','data-enable':'1',text:T('tog.fix.enable',{f:r.folder||'',l:(r.after||curMods).join(', ')})}));
    var md=modsDir().split('\\').join('/').toLowerCase(),o=String(r.out||'').split('\\').join('/').toLowerCase();
    if(r.inMods===false||(r.inMods===undefined&&(!md||o.indexOf(md+'/')!==0)))fres.appendChild(h('div',{class:'hint','data-move':'1',text:T('tog.fix.move')}));
    fres.appendChild(h('div',{class:'row'},[B(T('tog.fix.open'),function(){api('/api/x/share/clashopen',{dir:r.out},{job:false}).then(function(){toast(T('tog.fix.opened'))}).catch(fail(fstat))})]))}
   var fl=h('div');r.files.slice(0,300).forEach(function(f){var v=write?null:viewOf(f),kids=[h('b',{text:f.dest||f.key}),h('div',{class:'hint',text:whatText(f)})];if(v)kids.push(v);fl.appendChild(h('div',{class:'wzstat','data-file':f.key},kids))});
   fres.appendChild(fl);if(r.files.length>300)fres.appendChild(h('div',{class:'hint',text:T('tog.more',{n:r.files.length-300})}));
   if(r.cant&&r.cant.length){fres.appendChild(h('div',{class:'err',text:T('tog.fix.cant')}));fres.appendChild(h('pre',{class:'log',text:r.cant.map(function(c){return c.key+'  '+cantText(c)}).join('\n')}))}
   if(write){
    if(r.notWinning&&r.notWinning.length)fres.appendChild(h('div',{class:'err',text:T('tog.fix.notwin',{l:r.notWinning.join(', ')})}));
    if(r.left&&r.left.length)fres.appendChild(h('div',{class:'hint',text:T('tog.fix.left',{n:r.left.length})}));
    LS.set('share.tog.patch',r.out);again.disabled=false;setPlanned(false);return}
   // Preview: a value both mods changed is a choice (the last mod's by default); a changed choice asks for Preview again
   var head=false;r.files.forEach(function(f){if(!f.choices||!f.choices.length)return;
    if(!head){head=true;fres.appendChild(h('div',{},[h('b',{text:T('tog.fix.choices')})]))}
    fres.appendChild(h('div',{class:'hint',text:f.key}));
    f.choices.slice(0,40).forEach(function(c){var sel=h('select',{'aria-label':c.path});
     c.values.forEach(function(v){if(v.src==='vanilla')return;var op=h('option',{value:v.src,text:v.src+' = '+v.val});sel.appendChild(op)});sel.value=c.pick;
     sel.onchange=function(){(picks[f.key]||(picks[f.key]={}))[c.path]=sel.value;setPlanned(false);say(fstat,'hint',T('tog.fix.dirty'))};
     fres.appendChild(h('label',{class:'f'},[h('span',{class:'n',text:c.path}),sel]))});
    var rest=(f.moreChoices||0)+Math.max(0,f.choices.length-40);if(rest)fres.appendChild(h('div',{class:'hint',text:T('tog.fix.moreChoices',{n:rest})}))});
   setPlanned(true)}
  var wb=B(T('tog.fix.write'),function(){fix(true)}),again=B(T('tog.fix.again'),function(){var p=out.value.trim()||LS.get('share.tog.patch','');if(!p){say(fstat,'err',T('tog.fix.needOut'));return}if(!curMods.length){say(fstat,'err',T('tog.need2'));return}run(curMods,false,p)});
  wb.disabled=true;
  var kit=dirKit(out,'share.togout',['mods','game','start'],function(){return modsDir()||KN.d&&KN.d.start||''},true);
  box.appendChild(card('tog.main',[hintB('tog.main.intro','tog.intro',T('b.intro')),ml.el,
   btns('tog.main.run',[h('button',{type:'button',class:'primary','data-primary':'1',text:T('tog.run'),onclick:function(){
    var p=ml.picked();if(p.length<2){say(stat,'err',T('tog.need2'));return}
    run(p,false)}})]),line('tog.main.stat',stat,T('b.stat')),line('tog.main.res',res,T('b.res'))],{name:T('b.main')}));
  box.appendChild(card('tog.fix',[blk('tog.fix.title',[h('h3',{text:T('tog.fix.title')})]),hintB('tog.fix.intro','tog.fix.intro',T('b.intro')),
   blk('tog.fix.out',[h('label',{class:'f'},[h('span',{class:'n req',text:T('tog.fix.out')}),kit.el]),h('div',{class:'hint',text:T('tog.fix.outH',{s:(modsDir()||'mods')+'/my_patch'})})],{'class':'fld',name:T('tog.fix.out')}),
   fldH('tog.fix.name',T('tog.fix.name'),pname,''),
   btns('tog.fix.run',[B(T('tog.fix.preview'),function(){fix(false)},'','primary'),wb,again]),line('tog.fix.stat',fstat,T('b.stat')),line('tog.fix.res',fres,T('b.res'))],{name:T('tog.fix.title')}));
  return box}

 // ---- Game updated? ----
 function secUpd(){
  var box=pane('upd'),withMod=h('input',{type:'checkbox'}),res=h('div'),stat=h('div',{class:'hint'});
  box.appendChild(card('upd.main',[hintB('upd.main.intro','upd.intro',T('b.intro')),blk('upd.main.with',[h('label',{},[withMod,' '+T('upd.withMod')])]),
   btns('upd.main.run',[h('button',{type:'button',class:'primary','data-primary':'1',text:T('upd.run'),onclick:function(){
    res.textContent='';say(stat,'hint',T('working'));
    api('/api/x/share/updated',{mod:withMod.checked?S.mod:''}).then(function(x){
     if(!x.available){say(stat,'err',T('upd.missing'));return}
     if(x.code===0)say(stat,'ok',T('upd.same'));else if(x.code===1)say(stat,'err',T('upd.changed'));else say(stat,'err',T('upd.fail'));
     if(x.text)res.appendChild(h('pre',{class:'log',text:x.text}))}).catch(fail(stat))}})]),line('upd.main.stat',stat,T('b.stat')),line('upd.main.res',res,T('b.res'))],{name:T('b.main')}));
  return box}

 // ---- Before you share ----
 function secPerm(){
  var box=pane('perm'),ul=h('ul');['p1','p2','p3','p4','p5','p6'].forEach(function(k){ul.appendChild(h('li',{text:T('perm.'+k)}))});
  box.appendChild(card('perm.main',[blk('perm.main.title',[h('h3',{text:T('perm.title')})]),blk('perm.main.list',[ul],{name:T('perm.title')})]));
  if(S.mod)api('/api/x/share/info?mod='+encodeURIComponent(S.mod),undefined,{what:T('job.info')}).then(function(r){bannerTop(box,r)}).catch(function(){});
  return box}

 var BUILDERS={about:secAbout,gate:secGate,pack:secPack,ws:secWs,ver:secVer,play:secPlay,tog:secTog,upd:secUpd,perm:secPerm};
 var tabs={};
 SECS.forEach(function(id){var b=h('button',{type:'button',role:'tab',text:T('t.'+id),onclick:function(){go(id)}});tabs[id]=b;bar.appendChild(b)});
 function kids(e){return Array.prototype.slice.call(e.querySelectorAll('[data-blk]'))}
 function inside(a,e){while(e){if(e===a)return true;e=e.parentNode}return false}
 // a section built again (other mod) takes the place of the old one. Blocks the profile moved into the old one from elsewhere go back
 // to the screen first (blkApply puts them where the profile says); blocks of the old one the profile moved elsewhere go with it
 function swap(a,b,id){var p=a.parentNode||root,pre=id+'.';
  kids(a).forEach(function(e){if(e.getAttribute('data-blk').indexOf(pre)!==0&&inside(a,e))root.appendChild(e)});
  kids(root).forEach(function(e){if(e.getAttribute('data-blk').indexOf(pre)===0&&!inside(a,e)&&e.parentNode)e.parentNode.removeChild(e)});
  blkPut(p,b,a);if(a.parentNode)a.parentNode.removeChild(a)}
 // each section is a container block; the shown one is the one not hidden (the profile hides with its own class, apart from this)
 function go(id,force){cur=id;LS.set('share.sec',id);SECS.forEach(function(k){tabs[k].setAttribute('aria-selected',k===id?'true':'false');tabs[k].className=k===id?'primary':''});
  var key=id+'|'+S.mod+'|'+GID(),old=built[id];
  if(force||!old||old.key!==key){var el=BUILDERS[id]();if(old&&old.el)swap(old.el,el,id);else root.appendChild(el);built[id]={key:key,el:el}}
  SECS.forEach(function(k){if(built[k])built[k].el.hidden=k!==id});
  blkApply(root)}
 // lazy: the section is built at the first show (show0 calls refresh), not with the page
 return {refresh:function(){go(cur)},focus:function(){}}};
`;
