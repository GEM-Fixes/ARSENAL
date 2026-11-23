// help ext: browser script (page.js rules: no backtick, no dollar-brace, no innerHTML; DOM via h() and textContent only)
// Blocks: title, intro, jumps, then one card container per part (what, steps, py, safe; hdr, pages
// legend, ft; gl, lm, ts, gh; gd) holding leaves <card>.title and its parts.
// Three pages (owner 2026-11-22): the items of the Start Here sub-tab are views of this page (groups.js: help/first, help/around,
// help/lookup; page.js show(id,view) calls view()). A view shows its own cards; the guide reader (gd) opens under any of them when asked.
// Author: Imperator_Aug (ARSENAL, ia-be44eb8e)
module.exports = String.raw`
Promise.resolve().then(function(){var i=-1;NAMES.forEach(function(n,j){if(n[0]==='help')i=j});
  if(i>0)NAMES.unshift(NAMES.splice(i,1)[0]);if(LS.get('screen',null)==null)LS.set('screen','help')});
EXT_SCREENS.help=function(root){
  var st={lang:null,gl:null,ch:null,topic:null};
  function el(tag,cls,text,kids){return h(tag,{class:cls||null,text:text==null?null:text},kids||[])}
  function lines(key){return tx(key).split('\n')}
  // searchKit index hits: lower case text made once per item (lo); words at the start of a word first, at most 30 drawn
  function hitsOf(items,s,done,plain){s=String(s||'').trim().toLowerCase();if(!s){done([]);return}var a=[],b=[];
    for(var i=0;i<items.length;i++){var it=items[i],k=it.lo.indexOf(s);if(k<0)continue;(plain||k===0||it.lo.charAt(k-1)===' '?a:b).push(it)}
    var all=a.concat(b);done(all.slice(0,30),Math.max(0,all.length-30))}
  function list(arr){var u=el('ul');arr.forEach(function(t){u.appendChild(el('li',null,t))});return u}
  function box(id,key,border){var b=card(id,[blk(id+'.title',[el('h3',null,tx(key))])]);b.style.margin='0 0 14px';b.style.padding='10px 12px';b.style.border='1px solid '+(border||'var(--line)');b.style.borderRadius='6px';
    b.jk=key;return b}
  // a leaf of a card: id = <card>.<part>, nm = text key of its name (for leaves that start empty or hold only controls)
  function part(b,id,kids,nm){var x=blk(b.getAttribute('data-blk')+'.'+id,kids,nm?{name:tx(nm)}:{});b.appendChild(x);return x}
  function btn(key,fn){return h('button',{type:'button',text:tx(key),onclick:fn})}
  function hasPage(id){return !!(S.sec&&S.sec[id])}
  var tH=el('h2',null,tx('help.title')),iP=el('p','hint',tx('help.intro')),tP=el('p',null,tx('help.task'));
  root.appendChild(blk('title',[tH]));
  root.appendChild(blk('intro',[iP,tP]));
  var jrow=h('div',{class:'row',blk:'jumps','data-blkname':tx('help.blk.jumps')});jrow.style.gap='6px';root.appendChild(jrow);

  // 1 what is a mod
  var bw=box('what','help.what.h');var p2=lines('help.what.p2');
  part(bw,'body',[el('p',null,tx('help.what.p1')),el('p',null,p2[0]),list(p2.slice(1)),el('p','hint',tx('help.what.p3'))]);

  // 2 the 4 steps: [text key, page]. W5: the Change step opens Units where the current game has it, else the Generator (page id make); chosen on click (the game may change), its topic follows the page.
  // Its text follows the game too: chKey() picks the variant, refresh() sets it again after a game switch (INGAME is rebuilt per game)
  // game parity: the game of the page (curGame of page.js; none = AS64 as before) and the per-game variant of a text key:
  // <key>.goh under Gates of Hell, <key>.mowas2 under MoW:AS2, where the ext's lang has one; else the base key
  function gm(){try{var g=typeof curGame==='function'?curGame():null;if(g)return {id:g.id,kind:g.kind}}catch(e){}return {id:'as64',kind:'as2'}}
  function vk(key){var g=gm(),k=g.kind==='goh'?key+'.goh':g.id==='mowas2'?key+'.mowas2':'';return k&&tx(k)!==k?k:key}
  var bs=box('steps','help.steps.h');var ol=el('ol');part(bs,'list',[ol]);var chSpan=null,plSpan=null;
  function chKey(){return INGAME.units?'help.step.change':gm().kind==='goh'?'help.step.change.goh':'help.step.change.gen'}
  function stKey(k){return k==='change'?chKey():vk('help.step.'+k)}
  [['mods','mods'],['change',null],['check','check'],['play','play']].forEach(function(st){var k=st[0],li=el('li',null,null);li.style.margin='6px 0';
    function pg(){return st[1]||(INGAME.units?'units':'make')}
    var sp=el('span',null,tx(stKey(k))+' ');if(k==='change')chSpan=sp;if(k==='play')plSpan=sp;li.appendChild(sp);
    // a step whose page the current game does not have (Play under GoH): say what the step is and stay in this game, like the rows of card 4
    li.appendChild(btn('help.open',function(){var p=pg();if(!INGAME[p]||!hasPage(p))toast(tx(stKey(k)));else show(p)}));
    li.appendChild(btn('help.more',function(){topic(pg())}));ol.appendChild(li)});

  // 2a the top bar: games, the tabs of each game with their Alt keys (read from GAMES, the table groups.js gives the shell), switches, More
  var bh=box('hdr','help.hdr.h');var bhb=part(bh,'body',[el('p',null,tx('help.hdr.p')),el('p','hint',tx('help.hdr.games'))]);
  (typeof GAMES!=='undefined'?GAMES:[]).forEach(function(g){var gl=el('ul');gl.setAttribute('data-hgame',g.id);
    // per tab (its label always): its sub-tabs, each with its items (a ref = page id or page/view; refs with no page are left out)
    (g.tabs||[]).forEach(function(t){var subs=t.subs||[{pages:t.pages||[]}],many=subs.length>1;
      var parts=subs.map(function(s){var rs=(s.pages||[]).filter(function(r){return NAVK[String(r).split('/')[0]]});if(!rs.length)return '';
        var names=rs.map(function(r){var p=String(r).split('/')[0],adv=(typeof ADVREF!=='undefined'&&ADVREF.indexOf(r)>=0)||(ADV[p]&&(g.open||[]).indexOf(p)<0);
          return (typeof refLabel==='function'?refLabel(r):tx(NAVK[p]))+(adv?' ('+tx('help.hdr.adv')+')':'')});
        var sl=many&&s.label?tx(s.label):'';return sl?(names.length>1||names[0]!==sl?sl+' ('+names.join(', ')+')':sl):names.join(', ')}).filter(Boolean);
      if(!parts.length)return;
      gl.appendChild(el('li',null,(t.key?'Alt+'+t.key+'  ':'')+tx(t.label)+': '+parts.join('; ')))});
    bhb.appendChild(el('b',null,g.name));bhb.appendChild(gl)});
  bhb.appendChild(el('p','hint',typeof SETFILE!=='undefined'&&SETFILE?tx('help.hdr.set',{file:SETFILE}):tx('help.hdr.setNone')));

  // 2b N2-5: switch the mod on in the normal game (Install only copies the folder)
  // Gates of Hell: its own mod list steps (GHVFS-01, -02, -24, -27, GHLOG-16), help-local keys; drawn again on a game switch
  var bpy=box('py','py.title');var pyl=el('ol'),pyn=el('p','hint');part(bpy,'body',[pyl,pyn]);
  function drawPy(){var goh=gm().kind==='goh';pyl.textContent='';
    (goh?['help.py.goh.s1','help.py.goh.s2','help.py.goh.s3','help.py.goh.s4','help.py.goh.s5']:['py.s1','py.s2','py.s3','py.s4','py.s5','py.s6']).forEach(function(k){pyl.appendChild(el('li',null,tx(k)))});
    pyn.textContent=tx(goh?'help.py.goh.note':'py.note')}
  drawPy();

  // 3 safety strip
  var bf=box('safe','help.safe.h','var(--lvok)');bf.style.borderLeft='5px solid var(--lvok)';part(bf,'body',[list([tx('help.safe.1'),tx('help.safe.2'),tx('help.safe.3'),tx('help.safe.4')])]);

  // 4 other pages
  var bp=box('pages','help.pages.h');var pl=el('ul');pl.style.listStyle='none';pl.style.padding='0';pl.style.margin='0';part(bp,'list',[pl]);
  ['units','maps','mapviz','missions','modes','art','bots','unitai','mapai','doctrine','ide','logs','share','guides','claude','docs','upgrade','make','settings','files','pro','goh'].forEach(function(id){var li=el('li',null,null);li.style.display='flex';li.style.alignItems='baseline';li.style.gap='8px';li.style.padding='5px 0';li.style.borderBottom='1px solid var(--line)';
    // one row per page: the text takes the width, the two buttons stay at the end of the row
    var sp=el('span',null,tx('help.page.'+id)+' ');sp.style.flex='1';li.appendChild(sp);
    // a page the current game does not have (INGAME, read at click time: it is rebuilt per game): show what it is and stay in this game.
    // An Advanced page with Advanced off: the shell's link gate (as2Link) refuses it, so say where to turn Advanced on
    var o=btn('help.open',function(){if(!INGAME[id]||!hasPage(id))toast(tx('help.page.'+id));else if(typeof as2Link!=='function')show(id);else if(!as2Link('page:'+id))toast(tx('help.advOff'))});o.style.whiteSpace='nowrap';li.appendChild(o);
    var mo=btn('help.more',function(){topic(id)});mo.style.whiteSpace='nowrap';li.appendChild(mo);pl.appendChild(li)});

  // 5 legend
  var bl=box('legend','help.legend.h');var lt=el('dl');part(bl,'list',[lt]);
  var COL={crash:'var(--lvbad)',silent:'var(--lvwarn)',desync:'var(--lvsync)',cosmetic:'var(--lvinfo)',review:'var(--lvnote)',info:'var(--lvnote)',static:'var(--lvok)',V:'var(--lvok)',I:'var(--lvwarn)',T:'var(--lvbad)'};
  ['crash','silent','desync','cosmetic','review','info','static','V','I','T'].forEach(function(k){var s=tx('help.lg.'+k);var cut=s.indexOf(':');
    var dt=el('dt');var b=el('b',null,cut>0?s.slice(0,cut):k);b.style.borderLeft='4px solid '+COL[k];b.style.paddingLeft='6px';dt.appendChild(b);lt.appendChild(dt);
    var dd=el('dd',null,cut>0?s.slice(cut+1).trim():s);dd.style.margin='0 0 6px 14px';lt.appendChild(dd)});

  // 6 my change is not showing
  var bt=box('ts','help.ts.h');var all=lines('help.ts.all');part(bt,'all',[el('p',null,all[0]),list(all.slice(1))]);
  var TS=['def','tex','snd','mdl','lng','info','map'];
  var tsel=h('select',{'aria-label':tx('help.ts.pick'),onchange:function(){drawTs()}},TS.map(function(k){return h('option',{value:k,text:tx('help.ts.'+k)})}));
  bt.appendChild(fld('ts.pick',tx('help.ts.pick'),tsel));
  var tout=el('div');part(bt,'out',[tout],'help.blk.tsout');
  function drawTs(){tout.textContent='';tout.appendChild(list(lines(vk('help.ts.'+tsel.value+'.t'))))}
  drawTs();

  // 7 file types cheat sheet (textures differ under Gates of Hell: BC5 loads, GHFMT-03)
  var bc=box('ft','help.ft.h');var ftb=part(bc,'body',[]);
  function drawFt(){ftb.textContent='';ftb.appendChild(list([tx('help.ft.text'),tx('help.ft.bin'),tx('help.ft.snd'),tx(vk('help.ft.tex')),tx('help.ft.pak')]))}
  drawFt();

  // 8 get help: diagnostics
  var bg=box('gh','help.gh.h');part(bg,'intro',[el('p','hint',tx('help.gh.intro'))]);
  var ta=h('textarea',{readonly:true,rows:14,'aria-label':tx('help.gh.h')});ta.style.width='100%';ta.style.fontFamily='monospace';ta.hidden=true;
  var copyB=btn('help.gh.copy',function(){copy(ta)});copyB.disabled=true;
  var grow=h('div',{class:'row',blk:'gh.btns'});grow.appendChild(btn('help.gh.make',function(){ta.hidden=false;ta.value=tx('help.working');
    // the current game's own folder (the GoH install under Gates of Hell, curFolder of page.js); api() sends the game id with it
    var g='';try{g=typeof curFolder==='function'?curFolder():gameDir()}catch(e){g=''}
    api('/api/x/help/diag?mod='+encodeURIComponent(S.mod||'')+'&game='+encodeURIComponent(g||'')+'&kind='+encodeURIComponent(gm().kind),undefined,{what:tx('help.job.diag')}).then(function(j){ta.value=j.text;copyB.disabled=false}).catch(function(e){ta.value=e.cancelled?e.message:tx('help.err',{m:e.message})})}));
  grow.appendChild(copyB);bg.appendChild(grow);part(bg,'out',[ta],'help.blk.ghout');
  function copy(t){var v=t.value;function fb(){try{t.focus();t.select();if(document.execCommand('copy'))toast(tx('help.gh.copied'));else toast(tx('help.gh.nocopy'))}catch(e){toast(tx('help.gh.nocopy'))}}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(v).then(function(){toast(tx('help.gh.copied'))},fb);else fb()}

  // 9 limits lookup
  var bm=box('lm','help.lm.h');part(bm,'intro',[el('p','hint',tx('help.lm.intro'))]);
  var lin=h('input',{type:'text',placeholder:'VFS-19','aria-label':tx('help.lm.h')});lin.style.width='9em';
  bm.appendChild(h('div',{class:'row',blk:'lm.ask','data-blkname':tx('help.blk.lmask')},[lin,btn('help.lm.go',look)]));var lout=el('div');part(bm,'out',[lout],'help.blk.lmout');
  // searchKit (page.js; owner 2026-11-19: browse, indexed search and history on every search box): index = every limits ID with its
  // subject (/limitids, asked once), the current game's rows first (GH areas under Gates of Hell); Browse = the folder picker on the
  // limits folder the rows are read from under Gates of Hell): a picked area file (VFS.md, VFS2.md) puts "VFS-" in the box
  // and lists that area's IDs; an ID from the list looks it up
  var LIX=null,LWAIT=null,LDIR={};
  function limItems(cb){var goh=gm().kind==='goh';if(LIX){cb(goh?LIX.goh:LIX.as2);return}if(LWAIT){LWAIT.push(cb);return}LWAIT=[cb];
    function fin(){var w=LWAIT;LWAIT=null;w.forEach(function(f){limItems(f)})}
    api('/api/x/help/limitids',undefined,{what:tx('help.job.limits')}).then(function(j){LDIR=j.dirs||{};var a=(j.rows||[]).map(function(r){return {label:r.id,value:r.id,hint:r.subj,goh:!!r.goh,lo:(r.id+' '+r.subj).toLowerCase()}});
      LIX={as2:a.filter(function(x){return !x.goh}).concat(a.filter(function(x){return x.goh})),goh:a.filter(function(x){return x.goh}).concat(a.filter(function(x){return !x.goh}))};fin()},function(){LIX={as2:[],goh:[]};fin();LIX=null})}
  function stem(p){var b=String(p||'').replace(/[\\\/]+$/,'').split(/[\\\/]/).pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}
  var linKit=searchKit(lin,{key:'help.limit',index:function(s,done){limItems(function(a){hitsOf(a,s,done,true)})},
    browse:{mode:'file',exts:['md'],start:function(){return gm().kind==='goh'?(LDIR.goh||LDIR.as2||''):(LDIR.as2||LDIR.goh||'')},
      toValue:function(p){var b=stem(p),m=/^([A-Za-z][A-Za-z0-9]*?)\d*$/.exec(b);return m&&!/^index$/i.test(b)?m[1].toUpperCase()+'-':''}},
    onPick:function(v,it,from){lin.value=v;if(from!=='browse'){look();return}
      // an area: its IDs open under the box (the kit asks the index for the text)
      linKit.focus();if(typeof Event==='function'&&typeof lin.dispatchEvent==='function'){try{lin.dispatchEvent(new Event('input'));return}catch(e){}}if(typeof lin.fire==='function')lin.fire('input')}});
  // the folders come with the IDs: asked when the Browse button is near (hover or keyboard focus), so the first click opens there
  function preLim(){if(!LIX)limItems(function(){})}
  linKit.browseButton.addEventListener('mouseover',preLim);linKit.browseButton.addEventListener('focus',preLim);
  lin.addEventListener('keydown',function(e){if(!e._sk&&e.key==='Enter')look()});
  function look(){var id=lin.value.trim();if(!id)return;lout.textContent=tx('help.working');
    api('/api/x/help/limit?id='+encodeURIComponent(id),undefined,{what:tx('help.job.limit')}).then(function(j){lout.textContent='';
      if(j.nofiles){lout.appendChild(el('p','hint',tx('help.lm.nofiles')));return}
      if(!j.found){lout.appendChild(el('p','err',tx('help.lm.none',{id:j.id})));return}
      var names=lines('help.lm.cols');var dl=el('dl');dl.appendChild(el('dt',null,j.id+'  ('+j.file+')'));
      j.cells.slice(1).forEach(function(c,i){if(!c)return;var dt=el('dt',null,names[i]||(j.head[i+1]||''));dt.style.fontWeight='bold';dl.appendChild(dt);var dd=el('dd',null,c.replace(/[*]/g,''));dd.style.margin='0 0 6px 14px';dl.appendChild(dd)});
      lout.appendChild(dl)}).catch(function(e){lout.textContent='';lout.appendChild(el('p','err',e.message))})}

  // 10 glossary
  var bgl=box('gl','help.gl.h');var gq=h('input',{type:'search',placeholder:tx('help.gl.search'),'aria-label':tx('help.gl.search'),oninput:function(){soonGl()}});gq.style.width='100%';
  var gnote=el('p','hint');var gcount=el('div','hint');var gout=el('dl');gout.style.maxHeight='70vh';gout.style.overflow='auto';
  part(bgl,'q',[gq],'help.blk.glq');part(bgl,'list',[gnote,gcount,gout],'help.blk.gllist');
  // searchKit: index = the glossary terms A to Z; Browse = the folder picker on the guide folder the terms' chapters are in: a picked
  // chapter (03-mod-folder-and-load-order.md) narrows the list to the terms of that chapter; a term shows that term. Typing draws the
  // list in the next frame (one draw per frame) over lower case text made once per term
  var GIX=null;function glItems(){if(!st.gl)return [];if(GIX&&GIX.src===st.gl)return GIX.items;
    var a=st.gl.terms.map(function(t){return {label:t.t,value:t.t,hint:String(t.d||'').slice(0,70),lo:String(t.t||'').toLowerCase()}});
    a.sort(function(x,y){return x.lo<y.lo?-1:x.lo>y.lo?1:0});GIX={src:st.gl,items:a};return a}
  var glKit=searchKit(gq,{key:'help.glossary',index:function(s,done){if(!st.gl&&!st.glAsk){st.glAsk=1;loadGl()}hitsOf(glItems(),s,done)},
    browse:{mode:'file',exts:['md'],start:function(){return st.gl&&st.gl.dir||''},toValue:function(p){return stem(p)}},
    onPick:function(v){gq.value=v;drawGl()}});
  // a term belongs to a chapter the text names (its file name without .md)
  function inCh(t,q){var c=t.ch||[];for(var i=0;i<c.length;i++)if(String(c[i]).toLowerCase().replace(/\.md$/,'')===q)return true;return false}
  glKit.el.style.width='100%';
  var glPend=false;function soonGl(){if(typeof requestAnimationFrame!=='function'){drawGl();return}if(glPend)return;glPend=true;requestAnimationFrame(function(){glPend=false;drawGl()})}
  function drawGl(){gout.textContent='';if(!st.gl)return;var q=gq.value.trim().toLowerCase();var n=0;
    st.gl.terms.forEach(function(t){if(q&&(t.lo||(t.lo=(t.t+' '+t.d).toLowerCase())).indexOf(q)<0&&!inCh(t,q))return;n++;if(n>200)return;
      var dt=el('dt',null,t.t);dt.style.fontWeight='bold';gout.appendChild(dt);var dd=el('dd',null,t.d);dd.style.margin='0 0 8px 14px';
      if(t.ch&&t.ch.length){var r=el('div','hint',tx('help.gl.chapters')+' ');t.ch.forEach(function(f){var a=h('a',{href:'#',text:f.replace(/\.md$/,''),onclick:function(e){e.preventDefault();openCh(f)}});a.style.marginRight='8px';r.appendChild(a)});dd.appendChild(r)}
      gout.appendChild(dd)});
    gcount.textContent=tx('help.gl.count',{n:n,t:st.gl.terms.length})}
  function loadGl(){api('/api/x/help/glossary?lang='+encodeURIComponent(LANG),undefined,{what:tx('help.job.glossary')}).then(function(j){st.gl=j;gnote.textContent=j.noloc?tx('help.gl.noloc'):'';drawGl()}).catch(function(e){gnote.textContent=tx('help.err',{m:e.message})})}

  // 11 guide reader
  var bgd=box('gd','help.gd.h');var gtop=el('div','hint');var gsel=h('select',{'aria-label':tx('help.gd.pick'),onchange:function(){if(gsel.value)openCh(gsel.value,true)}});
  part(bgd,'topic',[gtop],'help.blk.gdtopic');
  var grow2=fld('gd.pick',tx('help.gd.pick'),gsel);bgd.appendChild(grow2);
  var gwhere=el('p','hint');var gtext=el('div');gtext.style.maxHeight='560px';gtext.style.overflow='auto';
  part(bgd,'where',[gwhere],'help.blk.gdwhere');part(bgd,'text',[gtext],'help.blk.gdtext');
  function loadChs(){api('/api/x/help/chapters?lang='+encodeURIComponent(LANG),undefined,{what:tx('help.job.chapters')}).then(function(j){st.ch=j;gsel.textContent='';
      if(!j.found){grow2.hidden=true;gwhere.textContent=tx('help.gd.none',{w:(j.looked||[]).join('; ')});return}
      grow2.hidden=false;gwhere.textContent=tx('help.gd.from',{w:j.where});gsel.appendChild(h('option',{value:'',text:'...'}));
      j.chapters.forEach(function(c){gsel.appendChild(h('option',{value:c.file,text:c.file.slice(0,2)+'  '+c.title+(c.loc?'':'')}))});
      if(st.topic)topic(st.topic,true)}).catch(function(e){gwhere.textContent=tx('help.err',{m:e.message})})}
  function openCh(f,stay){if(!stay){bgd.hidden=false;bgd.scrollIntoView({behavior:'smooth'})}gsel.value=f;gtext.textContent=tx('help.working');
    api('/api/x/help/chapter?file='+encodeURIComponent(f)+'&lang='+encodeURIComponent(LANG),undefined,{what:tx('help.job.chapter')}).then(function(j){gtext.textContent='';
      if(!j.found){gtext.appendChild(el('p','hint',tx('help.gd.none',{w:(j.looked||[]).join('; ')})));return}
      if(j.fallback&&LANG!=='en')gtext.appendChild(el('p','hint',tx('help.gd.en')));
      gtext.appendChild(el('h3',null,j.title));
      j.sections.forEach(function(s){if(s.h)gtext.appendChild(el('h4',null,s.h));var p=el('div',null,s.text);p.style.whiteSpace='pre-wrap';p.style.margin='0 0 10px';gtext.appendChild(p)})})
      .catch(function(e){gtext.textContent='';gtext.appendChild(el('p','err',tx('help.err',{m:e.message})))})}
  function topic(id,stay){st.topic=id;if(!stay)bgd.hidden=false;if(!st.ch){loadChs();bgd.scrollIntoView({behavior:'smooth'});return}var fs=(st.ch.topics||{})[id]||[];gtop.textContent='';
    if(fs.length){gtop.appendChild(document.createTextNode(tx('help.gd.topic')+' '));fs.forEach(function(f){var a=h('a',{href:'#',text:f.replace(/\.md$/,''),onclick:function(e){e.preventDefault();openCh(f)}});a.style.marginRight='10px';gtop.appendChild(a)})}
    if(fs.length&&st.ch.found)openCh(fs[0],stay);else if(!stay)bgd.scrollIntoView({behavior:'smooth'})}
  // N2-20/N2-5/N2-3: other pages jump here (my change is not showing, switch the mod on, a glossary word)
  // the cards of each view, in page order; a card another page asks for (as2Help) opens the view that holds it
  var VIEWS={first:[bw,bs,bpy,bf],around:[bh,bp,bl,bc],lookup:[bgl,bm,bt,bg]},VK=['first','around','lookup'],CUR='first',jb=[];
  VK.forEach(function(k){VIEWS[k].forEach(function(b){root.appendChild(b);
    var j=h('button',{type:'button',text:tx(b.jk),onclick:function(){b.scrollIntoView({behavior:'smooth'})}});jb.push([k,j]);jrow.appendChild(j)})});
  root.appendChild(bgd);
  function vOf(b){for(var i=0;i<VK.length;i++)if(VIEWS[VK[i]].indexOf(b)>=0)return VK[i];return 'first'}
  // the first page is short: no jump row there. A change of page closes the guide reader
  function view(v){if(!VIEWS[v])v='first';if(v!==CUR)bgd.hidden=true;CUR=v;var f=v==='first';
    tH.textContent=tx(f?'help.title':'help.view.'+v);iP.textContent=tx(f?'help.intro':'help.intro.'+v);tP.hidden=!f;jrow.hidden=f;
    VK.forEach(function(k){VIEWS[k].forEach(function(b){b.hidden=k!==v})});jb.forEach(function(x){x[1].hidden=x[0]!==v})}
  bgd.hidden=true;view('first');
  function jump(b){view(vOf(b));show('help',vOf(b));setTimeout(function(){if(b.scrollIntoView)b.scrollIntoView({behavior:'smooth'})},0)}
  window.as2Help={topic:function(id){show('help');topic(id)},notShowing:function(){jump(bt)},playYourself:function(){jump(bpy)},glossary:function(q){gq.value=q||'';drawGl();jump(bgl)}};

  function refresh(){var sv=typeof S!=='undefined'&&S.view&&S.view.help;if(sv&&sv!==CUR)view(sv);if(chSpan)chSpan.textContent=tx(chKey())+' ';if(plSpan)plSpan.textContent=tx(stKey('play'))+' ';drawPy();drawTs();drawFt();
    lin.placeholder=gm().kind==='goh'?'GHVFS-13':'VFS-19';if(st.lang!==LANG){st.lang=LANG;st.gl=null;st.ch=null;loadGl();loadChs()}}
  return {refresh:refresh,focus:function(){},view:function(v){view(String(v))}}};
`;
