// browser side of the "Mod files" page. Page rules: no backtick, no dollar-brace, DOM only through h() and textContent.
// Author: Imperator_Aug (ARSENAL, ia-e2bdfb7e)
module.exports = String.raw`
EXT_SCREENS.files=function(root){
 var BASE='/api/x/files/';
 // a phone (page RMT, gui.js remote view) reads only: no restore points tab, no copy into the mod, no folder picker (the server refuses them too)
 var FRM=(typeof RMT!=='undefined'&&!!RMT);
 var TABS=FRM?['tree','edit','search']:['tree','edit','search','undo'];
 var cur=LS.get('files.tab','tree');if(TABS.indexOf(cur)<0)cur='tree';
 var TREE=null,TREEMOD='',ED=null,SR=null,lastMod='';
 // game parity: api() sends the page's game; the tree and the open file belong to one mod in one game (a game switch reloads them)
 function modKey(){return String(S.mod||'')+'|'+String(S.gameId||'')}
 function qs(o){var s=[];Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=='')s.push(encodeURIComponent(k)+'='+encodeURIComponent(o[k]))});return s.join('&')}
 function errBox(m){return h('div',{class:'err',text:tx('files.error',{m:m})})}
 function hint(t){return h('div',{class:'hint',text:t})}
 // a plain card (not a block): used inside leaf blocks. Blocks use page card/blk with ids from code constants
 function pcard(title,kids){return h('div',{class:'card'},[title?h('h3',{text:title}):null].concat(kids).filter(Boolean))}
 function btn(t,fn,primary){return h('button',{type:'button',class:primary?'primary':null,text:t,onclick:fn})}
 function kb(n){return n>=1024?Math.round(n/1024)+' KB':n+' B'}
 function nk(n){return 'files.n.'+String(n).replace(/-/g,'')}
 function diffBox(hunks){var pre=h('pre',{class:'log'});
  (hunks||[]).forEach(function(k){pre.appendChild(h('span',{class:'q',text:'@@ '+tx('files.ed.line',{n:k.oldLine})+'\n'}));
   k.del.forEach(function(t){pre.appendChild(h('span',{class:'e',text:'- '+t+'\n'}))});
   k.add.forEach(function(t){pre.appendChild(h('span',{class:'a',text:'+ '+t+'\n'}))})});
  return pre}
 function dirtyOk(){if(ED&&ED.editable&&ED.ta&&ED.ta.value!==ED.text)return confirm(tx('files.ed.dirty'));return true}
 // searchKit (page.js; owner 2026-11-19: every search box has a manual browse, an indexed search and a history list). Index rows carry
 // their lowercase text once (lo); a hit list is the first 40 that hold the typed text, the rest counted for the kit's "more" note
 function skHits(a,q,done){q=String(q||'').toLowerCase();var out=[],n=0;for(var i=0;i<a.length;i++)if(a[i].lo.indexOf(q)>=0){n++;if(out.length<40)out.push(a[i])}done(out,n-out.length)}
 function frame(f){if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);else setTimeout(f,0)}
 // the mod's file tree, loaded once per mod and game (the Files tab draws it, the Search tab's index reads it)
 var TWAIT=[];
 function loadTree(cb){if(TREE&&TREEMOD===modKey()){cb(TREE);return}TWAIT.push(cb);if(TWAIT.length>1)return;var k=modKey();
  api(BASE+'tree?'+qs({mod:S.mod}),undefined,{what:tx('files.job.tree')}).then(function(t){TREE=t;TREEMOD=k;TWAIT.splice(0).forEach(function(f){f(t,null)})}).catch(function(e){TWAIT.splice(0).forEach(function(f){f(null,e)})})}
 // index of the tree filter: every file by its path; of the content search: the file names without extension
 function treeItems(){if(!TREE)return [];if(TREE._sk)return TREE._sk;
  return (TREE._sk=TREE.files.map(function(f){return {label:f.rel,value:f.rel,hint:tx('files.st.'+f.state),lo:f.rel.toLowerCase()}}))}
 function stemItems(){if(!TREE)return [];if(TREE._st)return TREE._st;var seen={},a=[];
  TREE.files.forEach(function(f){var nm=f.rel.split('::').pop().split('/').pop(),st=nm.replace(/\.[^.]*$/,'')||nm,lo=st.toLowerCase();if(seen[lo])return;seen[lo]=1;a.push({label:st,value:st,hint:f.rel,lo:lo})});
  return (TREE._st=a)}
 // folders the page knows (this mod, the game, the mods in the game's mods folder): the index of a folder box
 var INST=null,INSTK='';
 function dirItems(cb){var k=String(S.gameId||'')+'|'+(typeof gameDir==='function'?gameDir():'');
  function out(I){var a=[],seen={};function add(p,g){p=String(p||'');var lo=p.toLowerCase();if(!p||seen[lo])return;seen[lo]=1;a.push({group:g,label:p.replace(/[\\\/]+$/,'').split(/[\\\/]/).pop()||p,value:p,hint:p,lo:lo})}
   add(S.mod,tx('files.g.mod'));add(typeof curFolder==='function'?curFolder():'',tx('files.g.game'));add(typeof gameDir==='function'?gameDir():'',tx('files.g.game'));
   var sep=/\//.test(I.game)&&!/\\/.test(I.game)?'/':'\\';if(I.game)I.mods.forEach(function(n){add(I.game.replace(/[\\\/]+$/,'')+sep+'mods'+sep+n,tx('files.g.mods'))});cb(a)}
  if(INST&&INSTK===k){out(INST);return}
  api('/api/installed',undefined,{what:tx('files.job.mods')}).then(function(j){INST={game:String(j&&j.game||''),mods:((j&&j.mods)||[]).map(function(m){return m.name})};INSTK=k;out(INST)}).catch(function(){out({game:'',mods:[]})})}

 root.appendChild(blk('title',[h('h2',{text:tx('files.h1')})]));
 var intro=h('div');root.appendChild(blk('intro',[intro]));
 var tabBar=h('div',{class:'row',role:'tablist',blk:'tabs','data-blkname':tx('files.blk.tabs')}),panel=h('div',{blk:'tab',box:'col','data-blkname':tx('files.blk.tab')}),tabs={};
 TABS.forEach(function(id){var b=h('button',{type:'button',role:'tab',text:tx('files.tab.'+id),onclick:function(){go(id)}});tabs[id]=b;tabBar.appendChild(b)});
 root.appendChild(tabBar);root.appendChild(panel);
 function drawIntro(){intro.textContent='';var kids=[h('p',{text:tx('files.intro')})];
  // GT-15: the page has no mod of its own; it shows the shared one (S.mod), which is changed in the header
  if(S.mod)kids.push(h('div',{class:'hint',title:S.mod,text:tx('files.modLine',{m:S.mod.replace(/[\\\/]+$/,'').split(/[\\\/]/).pop()})}));
  if(S.mod)kids.push(hint(tx('files.undoWhere',{p:S.mod.replace(/[\\\/]+$/,'')+'.arsenal-undo'})));
  intro.appendChild(pcard(null,kids))}
 // the open tab is drawn again into the container 'tab' (same ids each time); blkApply puts it back in the profile's arrangement
 function go(id){cur=id;LS.set('files.tab',id);
  TABS.forEach(function(t){tabs[t].setAttribute('aria-selected',t===id?'true':'false');tabs[t].className=t===id?'primary':''});
  panel.textContent='';
  if(!S.mod)panel.appendChild(h('div',{class:'card',blk:'nomod'},[hint(tx('files.noMod')),h('div',{class:'row'},[btn(tx('files.toMods'),function(){show('mods')})])]));
  else ({tree:treeTab,edit:editTab,search:searchTab,undo:undoTab})[id]();
  blkApply(root)}

 // ---------------- Files: tree + which file wins
 var whichBox=null;
 function treeTab(){
  var filt=h('input',{type:'text','aria-label':tx('files.filter'),placeholder:tx('files.filter'),value:LS.get('files.filter','')});
  var list=h('div',{class:'scroll',style:'max-height:30em;overflow:auto'});whichBox=h('div');
  // searchKit: index = the mod's files by path; Browse = the folder picker on the mod (a file picked there goes into the filter as its
  // path inside the mod, so its row shows); a phone has no disk: there Browse opens the game's data view and a pick filters by its game path
  var fo={key:'files.filter',index:function(q,done){skHits(treeItems(),q,done)}};
  if(FRM)fo.browse={mode:'file',view:'data',start:'',toValue:function(p,e){return String(e&&e.path||p||'')}};
  else fo.browse={mode:'file',start:function(){return S.mod||''},toValue:function(p){var a=String(p).replace(/\\/g,'/'),m=String(S.mod||'').replace(/\\/g,'/').replace(/\/+$/,'');
   if(!m||a.toLowerCase().indexOf(m.toLowerCase()+'/')!==0){toast(tx('files.browseOut'));return ''}return a.slice(m.length+1)}};
  var fKit=searchKit(filt,fo);fKit.browseButton.title=tx('files.browseT');
  panel.appendChild(h('div',{class:'row',blk:'tree.bar','data-blkname':tx('files.blk.find')},[fKit.el,btn(tx('files.reload'),function(){TREE=null;treeTab0()})]));
  var leg=[h('b',{text:tx('files.legend')+' '})];['override','new','loses','modinfo','unmounted','pak','inpak'].forEach(function(s){leg.push(badge(s));leg.push(document.createTextNode(' '))});
  panel.appendChild(h('div',{class:'hint',blk:'tree.legend'},leg));
  panel.appendChild(h('div',{blk:'tree.main',box:'cols','data-blkname':tx('files.blk.main')},[blk('tree.list',[list],{name:tx('files.blk.list')}),blk('tree.which',[whichBox],{name:tx('files.blk.which')})]));
  function treeTab0(){list.textContent='';list.appendChild(hint(tx('files.loading')));
   loadTree(function(t,e){if(e){list.textContent='';list.appendChild(errBox(e.message));return}fKit.refresh();draw()})}
  // typing: drawn in the next frame (one draw per frame however fast the keys come), matches on the lowercase path made once,
  // at most LIM rows and a "show more" button
  var LIM=200,lim=LIM,pend=false;
  function sched(){if(pend)return;pend=true;frame(function(){pend=false;draw()})}
  function draw(){list.textContent='';if(!TREE)return;LS.set('files.filter',filt.value);
   list.appendChild(hint(tx('files.count',{n:TREE.files.length})));
   if(TREE.truncated)list.appendChild(h('div',{class:'err',text:tx('files.truncated')}));
   (TREE.notes||[]).forEach(function(n){if(n!=='no-profile')list.appendChild(hint(tx(nk(n),{m:''})))});
   var w=filt.value.trim().toLowerCase();
   if(w){var its=treeItems(),n=0,shown=0;its.forEach(function(it,i){if(it.lo.indexOf(w)<0)return;n++;if(shown>=lim)return;shown++;list.appendChild(fileRow(TREE.files[i],TREE.files[i].rel))});
    if(n>shown)list.appendChild(h('div',{class:'row'},[btn(tx('files.more',{n:n-shown}),function(){lim+=500;draw()})]));return}
   var top={d:{},f:[]};
   TREE.files.forEach(function(f){var sp=f.rel.split('::'),parts=sp[0].split('/'),node=top;
    if(sp.length>1){parts[parts.length-1]+=' ::';parts=parts.concat(sp[1].split('/'))}
    for(var i=0;i<parts.length-1;i++){var k=parts[i];node=node.d[k]||(node.d[k]={d:{},f:[]})}
    node.f.push(f)});
   list.appendChild(dirNode(top,0))}
  function dirNode(node,depth){var box=h('div',{style:depth?'margin-left:14px':''});
   Object.keys(node.d).sort().forEach(function(k){var d=h('details',depth<1?{open:true}:{},[h('summary',{text:k+'/'})]);d.appendChild(dirNode(node.d[k],depth+1));box.appendChild(d)});
   node.f.forEach(function(f){var nm=f.rel.split('::').pop().split('/').pop();box.appendChild(fileRow(f,nm))});
   return box}
  function fileRow(f,label){var row=h('div',{class:'row',style:'gap:6px;margin:1px 0'});
   row.appendChild(h('a',{href:'#',text:label,title:f.rel,onclick:function(e){e.preventDefault();pickFile(f)}}));
   row.appendChild(badge(f.state));row.appendChild(h('span',{class:'hint',text:kb(f.size)}));return row}
  filt.addEventListener('input',function(){lim=LIM;sched()});
  if(TREE&&TREEMOD===modKey())draw();else treeTab0()}
 function badge(s){var col={override:'var(--infobg)',new:'var(--goodbg)',loses:'var(--crash)',modinfo:'var(--goodbg)',unmounted:'var(--chip)',mounted:'var(--chip)',pak:'var(--review)',inpak:'var(--review)'}[s]||'var(--chip)';
  return h('span',{class:'badge',style:'background:'+col+';color:var(--fg)',text:tx('files.st.'+s)})}
 function pickFile(f){if(!whichBox)return;whichBox.textContent='';
  var acts=[];
  // a pak: its bytes in the viewer (ext view); a file a viewer shows (sound, picture, bytes ...): opened there
  if(f.state==='pak'){whichBox.appendChild(pcard(f.rel,[hint(tx('files.st.pak')),window.VIEW?h('div',{class:'row'},[btn(tx('files.bytes'),function(){window.VIEW.open({mod:S.mod,rel:f.rel},null,{kind:'hex'})})]):null]));return}
  if(viewKind(f.rel,f.key))acts.push(btn(tx('files.openView'),function(){openIn({mod:S.mod,rel:f.rel})},true));
  else if(f.state==='inpak')acts.push(btn(tx('files.view'),function(){openIn({mod:S.mod,rel:f.rel})}));
  else acts.push(btn(tx('files.edit'),function(){openIn({mod:S.mod,rel:f.rel})},true));
  var box=h('div');whichBox.appendChild(pcard(f.rel,[h('div',{class:'row'},acts),box]));
  if(f.state==='inpak'&&!f.key)return;
  loadWhich(box,f.key?{mod:S.mod,key:f.key}:{mod:S.mod,rel:f.rel})}
 function loadWhich(box,q){box.textContent='';box.appendChild(hint(tx('files.loading')));
  api(BASE+'which?'+qs(q),undefined,{what:tx('files.job.which')}).then(function(w){box.textContent='';box.appendChild(whichView(w))}).catch(function(e){box.textContent='';box.appendChild(errBox(e.message))})}
 function whichView(w){var out=h('div');
  out.appendChild(h('b',{text:tx('files.which.h')}));
  (w.notes||[]).forEach(function(n){out.appendChild(hint(tx(nk(n),{m:w.error||''})))});
  if(!w.mounted)return out;
  out.appendChild(hint(tx('files.which.lead')));out.appendChild(hint(tx('files.which.path',{k:w.key})));
  if(!w.chain.length){out.appendChild(hint(tx('files.which.none')));return out}
  var tb=h('table',{class:'list'});
  w.chain.forEach(function(r,i){var where=r.kind==='deleted'?r.how:(r.container+(r.source==='pak'?' :: ':' / ')+r.entry);
   var acts=[];
   if(r.kind==='mine'&&r.source==='loose'&&!r.how)acts.push(btn(tx('files.edit'),function(){openIn({mod:S.mod,rel:relInMod(r)})}));
   else if(r.kind!=='deleted'){acts.push(btn(tx('files.view'),function(){openIn({mod:S.mod,key:w.key,idx:r.idx})}));
    if(r.kind!=='mine'&&!FRM)acts.push(btn(tx('files.copyIn'),function(){copyFlow({key:w.key,idx:r.idx},w.key)}))}
   tb.appendChild(h('tr',{},[h('td',{},[h('b',{text:(i===0&&r.winner?tx('files.which.wins'):tx('files.which.hidden'))})]),
    h('td',{text:tx('files.k.'+r.kind)+' ('+r.layer+')'}),h('td',{class:'hint',style:'word-break:break-all',text:where}),h('td',{},acts)]))});
  out.appendChild(tb);return out}
 function relInMod(r){var m=S.mod.replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase(),c=String(r.container).replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();
  var pre=c.length>m.length?String(r.container).replace(/\\/g,'/').slice(m.length+1)+'/':'';return pre+r.entry}

 // ---------------- copy into my mod (preview, then write)
 function copyFlow(src,rel){
  var box=h('div'),inp=h('input',{type:'text',value:rel,'aria-label':tx('files.copy.rel')});
  // in the which-file leaf the dialog is plain content; in a container (the Editor, the tab) it is a block of its own
  var host=cur==='edit'?edBox:whichBox||panel,inner=pcard(tx('files.copy.h'),[h('label',{text:tx('files.copy.rel')}),inp,box]);
  var dlg=host===whichBox?inner:blk('copy',[inner],{name:tx('files.copy.h')});blkPut(host,dlg,host.firstChild);
  function prev(){box.textContent='';var body={mod:S.mod,rel:inp.value};Object.keys(src).forEach(function(k){body[k]=src[k]});
   api(BASE+'copy',body,{what:tx('files.job.copy')}).then(function(p){box.textContent='';
    box.appendChild(hint(tx('files.copy.to',{p:p.file})));
    if(p.same){box.appendChild(h('div',{class:'ok',text:tx('files.copy.same')}));box.appendChild(btn(tx('files.cancel'),function(){dlg.remove()}));return}
    if(p.exists){box.appendChild(h('div',{class:'err',text:tx('files.copy.over')}));box.appendChild(diffBox(p.hunks))}else box.appendChild(hint(tx('files.copy.new')));
    box.appendChild(h('div',{class:'row'},[btn(tx('files.copy.do'),function(){body.write=true;
     api(BASE+'copy',body).then(function(r){dlg.remove();TREE=null;toast(tx('files.copy.done'));openIn({mod:S.mod,rel:r.rel})}).catch(function(e){box.appendChild(errBox(e.message))})},true),
     btn(tx('files.cancel'),function(){dlg.remove()})]))}).catch(function(e){box.textContent='';box.appendChild(errBox(e.message))})}
  inp.addEventListener('change',prev);prev()}

 // ---------------- Editor
 var edBox=h('div');
 // a file that is not text opens in its viewer (ext view: VIEW.open, the Editor's viewer tab or the kind's own page), never as the
 // "binary file" error: by its name first, and by the server's 415 for a name the viewer table does not know
 function viewKind(rel,key){try{return window.VIEW&&window.VIEW.kindOf?window.VIEW.kindOf(rel||key||'',key||''):null}catch(e){return null}}
 function openIn(q,line){if(viewKind(q.rel||q.key,q.key)&&window.VIEW.open(q)){toast(tx('files.viewIt'));return}
  if(!dirtyOk())return;ED={q:q,loading:true,line:line};go('edit');
  api(BASE+'open?'+qs(q),undefined,{what:tx('files.job.open')}).then(function(o){o.q=q;o.line=line;ED=o;if(cur==='edit')go('edit')}).catch(function(e){
   if(e&&e.status===415&&window.VIEW&&window.VIEW.open(q,null,{kind:'hex'})){ED=null;if(cur==='edit')go('edit');toast(tx('files.viewIt'));return}
   ED={q:q,error:e.message};if(cur==='edit')go('edit')})}
 // the Editor = container 'edit' with leaves edit.msg (none / loading / error) or edit.name, .info, .ro, .text, .btns, .out
 function editTab(){edBox=h('div',{blk:'edit',box:'col','data-blkname':tx('files.tab.edit')});panel.appendChild(edBox);
  function put(id,kids,nm){var x=blk('edit.'+id,kids,nm?{name:tx(nm)}:{});edBox.appendChild(x);return x}
  if(!ED){put('msg',[hint(tx('files.ed.none'))]);return}
  if(ED.loading){put('msg',[hint(tx('files.loading'))]);return}
  if(ED.error){put('msg',[errBox(ED.error)]);return}
  var name=ED.rel||ED.path||(ED.key+' ['+ED.idx+']');
  put('name',[h('h3',{text:name})]);
  var info=[hint(tx('files.ed.info',{n:ED.lines,e:ED.eol.toUpperCase()+(ED.bom?' + BOM':''),s:ED.size}))];
  if(ED.cpLines)info.push(hint(tx('files.ed.cp',{n:ED.cpLines})));put('info',info);
  if(!ED.editable){var ro=[h('div',{class:'err',text:tx('files.ed.ro.'+(ED.why||'outside'))})];
   if(ED.why==='layer'&&!FRM)ro.push(btn(tx('files.copyIn'),function(){copyFlow({key:ED.key,idx:ED.idx},ED.suggestRel)},true));
   if(ED.why==='outside'&&ED.path&&!FRM)ro.push(btn(tx('files.copyIn'),function(){copyFlow({path:ED.path},'')},true));
   put('ro',[h('div',{class:'row'},ro)])}
  var ta=h('textarea',{rows:'26',spellcheck:'false',wrap:'off','aria-label':name,style:'white-space:pre;overflow:auto'});
  ta.value=ED.text;ta.readOnly=!ED.editable;ED.ta=ta;put('text',[ta],'files.blk.text');
  var out=h('div'),bar=h('div',{class:'row'});
  if(ED.editable){bar.appendChild(btn(tx('files.ed.preview'),preview,true));bar.appendChild(btn(tx('files.ed.revert'),function(){ta.value=ED.text;out.textContent=''}))}
  if(ED.key&&ED.why!=='layer')bar.appendChild(btn(tx('files.ed.where'),function(){out.textContent='';var b=h('div');out.appendChild(b);loadWhich(b,{mod:S.mod,key:ED.key})}));
  put('btns',[bar],'files.blk.edbtns');put('out',[out],'files.blk.out');
  if(ED.line)setTimeout(function(){gotoLine(ta,ED.line)},0);
  function preview(){out.textContent='';
   if(ta.value===ED.text){out.appendChild(hint(tx('files.ed.nochange')));return}
   var body={mod:S.mod,rel:ED.rel,base:ED.hash,text:ta.value};
   api(BASE+'save',body,{what:tx('files.job.save')}).then(function(p){out.textContent='';
    if(!p.changed){out.appendChild(hint(tx('files.ed.nochange')));return}
    out.appendChild(h('b',{text:tx('files.ed.diff',{p:p.file})}));out.appendChild(diffBox(p.hunks));
    (p.warns||[]).forEach(function(w){if(w.code==='mixed')out.appendChild(h('div',{class:'err',text:tx('files.ed.mixed',{n:w.line})}))});
    out.appendChild(h('div',{class:'row'},[h('button',{type:'button',class:'primary','data-primary':'1',text:tx('files.ed.save'),onclick:function(){body.write=true;
     api(BASE+'save',body).then(function(r){var keep=ta.value;ED.text=keep;ED.hash=r.hash;TREE=null;out.textContent='';
      out.appendChild(h('div',{class:'ok',text:tx('files.ed.saved',{id:r.restorePoint})}));out.appendChild(h('div',{class:'row'},[btn(tx('files.ed.toCheck'),function(){show('check')})]))})
     .catch(function(e){out.appendChild(errBox(e.message))})}}),btn(tx('files.cancel'),function(){out.textContent=''})]))})
   .catch(function(e){out.appendChild(errBox(e.message))})}}
 function gotoLine(ta,line){var lines=ta.value.split('\n'),off=0;for(var i=0;i<line-1&&i<lines.length;i++)off+=lines[i].length+1;
  ta.focus();ta.setSelectionRange(off,off+(lines[line-1]||'').length);
  var lh=parseFloat(getComputedStyle(ta).lineHeight)||15;ta.scrollTop=Math.max(0,(line-6)*lh)}

 // ---------------- Search
 // SPEED: the search opens: the server starts reading the mod's text files into memory now (files/corpus.js), once per mod
 var WARMED='';
 function searchTab(){
  if(S.mod&&WARMED!==S.mod){WARMED=S.mod;api(BASE+'warm',{mod:S.mod}).catch(function(){})}
  var q=h('input',{type:'text','aria-label':tx('files.s.q'),placeholder:tx('files.s.q'),value:LS.get('files.q','')});
  function chk(key,lsk){var c=h('input',{type:'checkbox'});c.checked=!!LS.get(lsk,false);c.addEventListener('change',function(){LS.set(lsk,c.checked)});return [c,h('label',{text:' '+tx(key)+' '})]}
  var rx=chk('files.s.regex','files.rx'),cs=chk('files.s.case','files.cs'),va=chk('files.s.vanilla','files.va');
  var other=h('input',{type:'text','aria-label':tx('files.s.other'),value:LS.get('files.other','')}),res=h('div');
  other.addEventListener('change',function(){LS.set('files.other',other.value.trim())});
  var goB=h('button',{type:'button',class:'primary','data-primary':'1',text:tx('files.s.go'),onclick:run});
  // searchKit: the text box's index = the names of the mod's files (a unit, weapon or set name is what one searches for most), Browse =
  // the game's data view (the mod's files layered over the game's): a picked file's name without extension; a pick searches at once.
  // The other-folder box: index = the folders the page knows, Browse = the folder picker at that folder (else the mod)
  var qKit=searchKit(q,{key:'files.q',index:function(s,done){loadTree(function(){skHits(stemItems(),s,done)})},
   browse:{mode:'file',view:'data',start:'',toValue:function(p){var n=String(p||'').replace(/\\/g,'/').split('/').pop();return n.replace(/\.[^.]*$/,'')||n}},
   onPick:function(v){q.value=v;run()}});
  var oKit=FRM?null:searchKit(other,{key:'files.other',index:function(s,done){dirItems(function(a){skHits(a,s,done)})},browse:{mode:'dir',start:function(){return other.value.trim()||S.mod||''}}});
  panel.appendChild(card('search.form',[h('div',{class:'row',blk:'search.q','data-blkname':tx('files.blk.q')},[qKit.el,goB]),h('div',{class:'row',blk:'search.opts'},rx.concat(cs,va)),
   FRM?null:blk('search.other',[h('label',{text:tx('files.s.other')}),h('div',{class:'row'},[oKit.el,btn(tx('files.s.clear'),function(){other.value='';LS.set('files.other','')})])])],{name:tx('files.tab.search')}));
  panel.appendChild(blk('search.res',[res],{name:tx('files.blk.res')}));
  q.addEventListener('keydown',function(e){if(e._sk)return;if(e.key==='Enter'){run();e.preventDefault()}});
  if(SR&&SR.mod===S.mod)draw(SR);
  function run(){LS.set('files.q',q.value);qKit.remember(q.value);res.textContent='';res.appendChild(hint(tx('files.loading')));goB.disabled=true;
   api(BASE+'search',{mod:S.mod,q:q.value,regex:rx[0].checked,caseSens:cs[0].checked,vanilla:va[0].checked,other:FRM?'':other.value.trim()},{what:tx('files.job.search')})
   .then(function(r){goB.disabled=false;SR=r;draw(r)}).catch(function(e){goB.disabled=false;res.textContent='';res.appendChild(e.cancelled?h('div',{class:'hint',text:e.message}):errBox(e.message))})}
  function draw(r){res.textContent='';
   var files={};r.hits.forEach(function(x){files[x.file]=1});
   res.appendChild(hint(tx('files.s.found',{n:r.hits.length,f:Object.keys(files).length,ms:r.ms})));
   if(r.truncated)res.appendChild(h('div',{class:'err',text:tx('files.s.cut.'+r.truncated,{n:r.hits.length})}));
   if(r.asOf)res.appendChild(hint(tx('files.s.asof')));
   if(!r.hits.length){res.appendChild(hint(tx('files.s.none')));return}
   var tb=h('table',{class:'list'});
   r.hits.forEach(function(x){tb.appendChild(h('tr',{},[h('td',{class:'hint',text:tx('files.s.root.'+x.root)}),
    h('td',{},[h('a',{href:'#',text:x.rel+':'+x.line,title:x.file,onclick:function(e){e.preventDefault();openIn({mod:S.mod,path:x.file},x.line)}})]),
    h('td',{style:'font-family:Consolas,monospace;word-break:break-all',text:x.text})]))});
   res.appendChild(tb)}
  setTimeout(function(){qKit.focus()},0)}

 // ---------------- Undo
 function undoTab(){var box=h('div');panel.appendChild(h('div',{class:'card',blk:'undo.top'},[hint(tx('files.u.lead')),btn(tx('files.reload'),function(){undoTab0()})]));panel.appendChild(blk('undo.list',[box],{name:tx('files.blk.undo')}));
  function undoTab0(){box.textContent='';box.appendChild(hint(tx('files.loading')));
   api(BASE+'undo?'+qs({mod:S.mod}),undefined,{what:tx('files.job.undo')}).then(function(u){box.textContent='';
    box.appendChild(hint(u.root));
    if(!u.list.length){box.appendChild(hint(tx('files.u.none')));return}
    var tb=h('table',{class:'list'});
    u.list.forEach(function(p){var out=h('div');
     tb.appendChild(h('tr',{},[h('td',{text:new Date(p.time).toLocaleString()}),h('td',{style:'word-break:break-all',text:p.rel}),
      h('td',{class:'hint',text:tx('files.u.act.'+String(p.action).replace(/-/g,''))}),
      h('td',{},[btn(tx('files.u.preview'),function(){prev(p,out)}),out])]))});
    box.appendChild(tb)}).catch(function(e){box.textContent='';box.appendChild(errBox(e.message))})}
  function prev(p,out){out.textContent='';
   api(BASE+'restore',{mod:S.mod,id:p.id},{what:tx('files.job.restore')}).then(function(r){out.textContent='';
    if(r.same){out.appendChild(hint(tx('files.u.same')));return}
    if(r.removes)out.appendChild(h('div',{class:'err',text:tx('files.u.removes',{p:r.file})}));
    else{out.appendChild(hint(tx('files.u.brings',{p:r.file})));out.appendChild(diffBox(r.hunks))}
    out.appendChild(h('div',{class:'row'},[btn(tx('files.u.do'),function(){
     api(BASE+'restore',{mod:S.mod,id:p.id,write:true}).then(function(w){TREE=null;if(ED&&ED.rel===r.rel)ED=null;toast(tx('files.u.done',{id:w.restorePoint}));undoTab0()}).catch(function(e){out.appendChild(errBox(e.message))})},true),
     btn(tx('files.cancel'),function(){out.textContent=''})]))}).catch(function(e){out.appendChild(errBox(e.message))})}
  undoTab0()}

 // view(v): open on inner tab v (show('files','undo')); show() calls refresh() right after, which draws it. A caller that only set files.tab
 // before opening the page is honoured too (refresh reads it again), and so is a view asked before this page was built
 function tabOk(v){return TABS.indexOf(String(v||''))>=0}
 function view(v){if(tabOk(v)){cur=String(v);LS.set('files.tab',cur)}}
 if(S.view&&tabOk(S.view.files))view(S.view.files);
 function refresh(){var t=LS.get('files.tab',cur);if(tabOk(t))cur=t;
  drawIntro();if(modKey()!==lastMod){lastMod=modKey();TREE=null;SR=null;if(ED&&!(ED.ta&&ED.ta.value!==ED.text))ED=null}go(cur)}
 return {refresh:refresh,view:view,focus:function(){}}};
`;
