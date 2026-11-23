// guides ext: browser script (page.js rules: no backtick, no dollar-brace, no innerHTML; DOM via h() and textContent only).
// Links are plain anchors with target=_blank (the system browser opens them); only http(s) urls become links.
// Author: Imperator_Aug (ARSENAL, ia-f2ce4378)
module.exports = String.raw`
EXT_SCREENS.guides=function(root){
  var out={};
  var G={dir:'',st:null,tab:'search',last:null};
  function el(tag,cls,text,kids){return h(tag,{class:cls||null,text:text==null?null:text},kids||[])}
  function q(o){var p=[];for(var k in o)if(o[k]!=null&&o[k]!=='')p.push(k+'='+encodeURIComponent(o[k]));return p.length?'?'+p.join('&'):''}
  function link(url,text){if(!/^https?:\/\//i.test(url||''))return el('span','hint',url||'');
    return h('a',{href:url,target:'_blank',rel:'noopener noreferrer',text:text||url,title:url})}
  function note(p,msg,bad){p.textContent='';p.appendChild(el('p',bad?'err':'hint',msg))}
  // a request stopped from the job list (e.cancelled, message "Stopped"): the plain stopped state, not a red error
  function fail(p,e){if(e&&e.cancelled){note(p,e.message);return}note(p,tx('guides.err',{m:e.message}),true)}
  // JOBS: the name of a request in the footer's job list ("Guides: Search"); these calls also run after a reply or a pick, where no clicked button names them
  function wn(k){return {what:tx('guides.nav')+': '+tx(k)}}
  function label(text,ctl){var l=el('label',null,text+' ');l.appendChild(ctl);return l}
  function check(text){var c=h('input',{type:'checkbox'});var l=el('label',null,' '+text);l.insertBefore(c,l.firstChild);return {box:c,el:l}}
  function sel(opts,aria){var s=h('select',{'aria-label':aria});opts.forEach(function(o){s.appendChild(h('option',{value:o[0],text:o[1]}))});return s}
  function meta(r){var t=[r.game,r.comp,r.sub,r.lang].filter(function(x){return x}).join(' / ');return t}
  function badge(t,col){var b=el('span',null,t);b.style.background=col;b.style.color='var(--fg)';b.style.padding='0 6px';b.style.borderRadius='8px';b.style.fontSize='11px';b.style.marginLeft='6px';return b}

  // blocks: every part a leaf block; each tab pane a container; redraws refill leaf content only
  root.appendChild(blk('title',[el('h2',null,tx('guides.title'))]));
  root.appendChild(blk('intro',[el('p',null,tx('guides.intro'))]));
  var safe=el('div',null,tx('guides.safe'));safe.style.border='1px solid var(--warnl)';safe.style.padding='6px 10px';safe.style.margin='6px 0 10px';safe.style.borderRadius='4px';root.appendChild(blk('safe',[safe]));
  var head=el('div','hint');root.appendChild(blk('head',[head],{name:tx('guides.b.head')}));
  var nf=el('div');var nfB=blk('nf',[nf],{'class':'card',name:tx('guides.b.nf')});nfB.hidden=true;root.appendChild(nfB);
  var tabs=blk('tabs',[],{'class':'row',name:tx('guides.b.tabs')});tabs.style.margin='10px 0';root.appendChild(tabs);
  var panes={};var tbtn={};
  var NEED=['search','faq','tools','sources','update'];
  ['search','faq','tools','gaps','sources','update'].forEach(function(k){
    tbtn[k]=h('button',{type:'button',text:tx('guides.tab.'+k),onclick:function(){showTab(k)}});tabs.appendChild(tbtn[k]);
    panes[k]=blk(k,[],{box:'col',name:tx('guides.tab.'+k)});panes[k].hidden=true;root.appendChild(panes[k])});
  function showTab(k){G.tab=k;LS.set('guides.tab',k);for(var x in panes){panes[x].hidden=x!==k;tbtn[x].className=x===k?'primary':''}
    if(k==='faq')loadFaq();if(k==='tools')loadTools();if(k==='gaps')loadGaps();if(k==='sources')loadSources();if(k==='update')upShow()}
  function needIndex(k){return k!=='gaps'}

  // ---- index status / not-found card
  function pickDir(){pick('dir',G.dir||'',function(p){G.dir=p;loadStatus()})}
  function loadStatus(){head.textContent=tx('guides.working');var back=false;G.asked=true;G.asking=(G.asking||0)+1;
    api('/api/x/guides/status'+q({dir:G.dir})).then(function(j){back=true;G.asking--;G.st=j;head.textContent='';nf.textContent='';
      var ctl=el('div','row');
      ctl.appendChild(h('button',{type:'button',text:tx('guides.dir.change'),onclick:pickDir}));
      if(G.dir)ctl.appendChild(h('button',{type:'button',text:tx('guides.dir.reset'),onclick:function(){G.dir='';loadStatus()}}));
      if(!j.found){nfB.hidden=false;tabs.hidden=false;
        nf.appendChild(el('h3',null,tx('guides.nf.title')));
        if(j.broken)nf.appendChild(el('p','err',tx('guides.broken',{m:j.broken})));
        nf.appendChild(el('p',null,tx('guides.nf.what')));
        nf.appendChild(el('div','hint',tx('guides.nf.tried')));
        var ul=el('ul');(j.tried||[]).forEach(function(t){ul.appendChild(el('li',null,t))});nf.appendChild(ul);
        nf.appendChild(h('button',{type:'button',class:'primary',text:tx('guides.nf.pick'),onclick:pickDir}));
        if(G.dir)nf.appendChild(h('button',{type:'button',text:tx('guides.dir.reset'),onclick:function(){G.dir='';loadStatus()}}));
        nf.appendChild(el('p','hint',tx('guides.nf.session')));
        nf.appendChild(el('p','hint',tx('guides.nf.gaps')));
        NEED.forEach(function(k){tbtn[k].disabled=true});
        showTab('gaps');return}
      nfB.hidden=true;NEED.forEach(function(k){tbtn[k].disabled=false});
      head.appendChild(el('span',null,tx('guides.at',{d:j.dir,b:j.built||'?',n:j.rows,p:j.pages})));head.appendChild(ctl);
      fillFilters(j);showTab(G.tab)
    }).catch(function(e){if(!back)G.asking--;fail(head,e)})}

  // ---- search
  var sp=panes.search;
  var words=h('input',{type:'text',size:'36','aria-label':tx('guides.f.words'),placeholder:tx('guides.f.words')});
  var fTab=sel([['all',tx('guides.f.tab.all')],['guides',tx('guides.f.tab.guides')],['tools',tx('guides.f.tab.tools')],['history',tx('guides.f.tab.history')],['less',tx('guides.f.tab.less')]],tx('guides.f.tab'));
  var fGame=sel([],tx('guides.f.game')),fComp=sel([],tx('guides.f.comp')),fSub=sel([],tx('guides.f.sub')),fLang=sel([],tx('guides.f.lang'));
  var fText=check(tx('guides.f.text')),fDisc=check(tx('guides.f.discord')),fArch=check(tx('guides.f.archived'));
  sp.appendChild(h('div',{class:'row',blk:'search.q','data-blkname':tx('guides.b.words')},[words,h('button',{type:'button',class:'primary',text:tx('guides.btn.search'),onclick:function(){doSearch()}})]));
  sp.appendChild(h('div',{class:'row',blk:'search.f',box:'row','data-blkname':tx('guides.b.filters')},[fld('search.f.tab',tx('guides.f.tab'),fTab),fld('search.f.game',tx('guides.f.game'),fGame),fld('search.f.lang',tx('guides.f.lang'),fLang),
    fld('search.f.comp',tx('guides.f.comp'),fComp),fld('search.f.sub',tx('guides.f.sub'),fSub)]));
  sp.appendChild(blk('search.opts',[fText.el,el('br'),fArch.el,el('br'),fDisc.el],{name:tx('guides.b.opts')}));
  // searchKit (page.js; owner 2026-11-19: browse, indexed search and history on every search box). Index = the titles of the index rows
  // under the game filter (so it follows the game tab: AS2 games and Gates of Hell differ) and the FAQ questions, asked once per filter
  // (/titles); Browse = the folder picker on the guide index folder (its saved page texts are text/<id>.txt under pages/ and scrape/);
  // a picked page text puts its row's title in the box (else the file's name) and searches; an index row or a past query searches
  var TIX={key:''};
  function titles(cb){if(!G.st||!G.st.found){cb({items:[],faq:[]});return}var key=G.dir+'|'+fGame.value+'|'+(fDisc.box.checked?1:0);
    if(TIX.key===key&&TIX.items){cb(TIX);return}if(TIX.key===key&&TIX.wait){TIX.wait.push(cb);return}
    var me=TIX={key:key,items:null,faq:null,wait:[cb]};
    function fin(r){var w=me.wait;me.wait=null;w.forEach(function(f){f(r)})}
    api('/api/x/guides/titles',{dir:G.dir,game:fGame.value,discord:fDisc.box.checked}).then(function(j){
      me.items=(j.rows||[]).map(function(r){return {label:r.t,value:r.t,hint:[r.g,r.c,r.s].filter(Boolean).join(' / '),p:r.p||'',lo:(r.t+' '+r.c+' '+r.s).toLowerCase()}});
      me.faq=(j.faq||[]).map(function(f){return {label:f.q,value:f.q,hint:[f.g,f.c].filter(Boolean).join(' / '),lo:(f.q+' '+f.c).toLowerCase()}});
      fin(me)},function(){if(TIX===me)TIX={key:''};fin({items:[],faq:[]})})}
  function hitsOf(items,s,done){s=String(s||'').trim().toLowerCase();if(!s){done([]);return}var a=[],b=[];
    for(var i=0;i<items.length;i++){var it=items[i],k=it.lo.indexOf(s);if(k<0)continue;(k===0||it.lo.charAt(k-1)===' '?a:b).push(it)}
    var all=a.concat(b);done(all.slice(0,30),Math.max(0,all.length-30))}
  // Browse of both boxes: the guide index folder this page reads (Change folder, else the one found); the picked file's name, or the
  // title of the row whose saved text it is, goes into the box
  function stem(p){var b=String(p||'').replace(/[\\\/]+$/,'').split(/[\\\/]/).pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}
  var gBrowse={mode:'file',start:function(){return G.st&&G.st.found&&G.st.dir?G.st.dir:G.dir},toValue:function(p){var s=stem(p),lo=s.toLowerCase(),a=TIX.items||[];for(var i=0;i<a.length;i++)if(a[i].p&&a[i].p===lo)return a[i].value;return s}};
  function titleOf(v,cb){titles(function(t){var lo=String(v).toLowerCase(),a=t.items||[];for(var i=0;i<a.length;i++)if(a[i].p&&a[i].p.toLowerCase()===lo){cb(a[i].value);return}cb(v)})}
  searchKit(words,{key:'guides.search',index:function(s,done){titles(function(t){hitsOf(t.items,s,done)})},browse:gBrowse,
    onPick:function(v,it,from){if(from==='browse'){titleOf(v,function(t){words.value=t;doSearch()});return}words.value=v;doSearch()}});
  words.addEventListener('keydown',function(e){if(!e._sk&&e.key==='Enter')doSearch()});
  function fillSel(s,opts,keep){var v=keep?s.value:'';s.textContent='';opts.forEach(function(o){s.appendChild(h('option',{value:o[0],text:o[1]}))});if(v)s.value=v;if(s.selectedIndex<0)s.selectedIndex=0}
  function fillSubs(){var c=null;(G.st&&G.st.facets?G.st.facets.comps:[]).forEach(function(x){if(x.comp===fComp.value)c=x});
    fillSel(fSub,[['',tx('guides.f.sub.any')]].concat((c?c.subs:[]).map(function(s){return [s,s]})),false)}
  fComp.addEventListener('change',fillSubs);
  // game filter default per game kind: the AS2 games (AS64, MoW:AS2) start on as2rel, Gates of Hell on gohrel (goh, cta, gem2, all).
  // First open of a kind sets its default once (guides.gameSet for the AS2 games as before, guides.gameSet.goh); a game switch to the
  // other kind brings back what was picked there last (guides.game.<kind>), else that kind's default
  function gkind(){try{var g=typeof curGame==='function'?curGame():null;return g&&g.kind==='goh'?'goh':'as2'}catch(e){return 'as2'}}
  function gdef(k){return k==='goh'?'gohrel':'as2rel'}
  function pickGame(){var k=gkind(),first=G.kind==null;if(G.kind===k)return;G.kind=k;var sk=k==='goh'?'guides.gameSet.goh':'guides.gameSet';
    if(!LS.get(sk,false)){fGame.value=gdef(k);LS.set(sk,true)}
    else if(!first){fGame.value=LS.get('guides.game.'+k,gdef(k));if(fGame.selectedIndex<0)fGame.value=gdef(k)}}
  fGame.addEventListener('change',function(){if(G.kind)LS.set('guides.game.'+G.kind,fGame.value)});
  function fillFilters(j){var f=j.facets||{games:[],comps:[],langs:[]};
    fillSel(fGame,[['',tx('guides.f.game.any')],['as2rel',tx('guides.f.game.as2rel')],['gohrel',tx('guides.f.game.gohrel')]].concat(f.games.map(function(g){return [g.code,g.name+' ('+g.n+')']})),true);
    pickGame();
    fillSel(fComp,[['',tx('guides.f.comp.any')]].concat(f.comps.map(function(c){return [c.comp,c.comp]})),true);fillSubs();
    fillSel(fLang,[['',tx('guides.f.lang.any')]].concat(f.langs.map(function(l){return [l,l]})),true)}
  var res=el('div');sp.appendChild(blk('search.res',[res],{name:tx('guides.b.res')}));
  // the preview is part of the results leaf: it opens under the row it shows (never a block of its own)
  var pv=el('div','card');pv.hidden=true;res.appendChild(pv);
  function filter(){return {q:words.value.trim(),tab:fTab.value,game:fGame.value,comp:fComp.value,sub:fSub.value,lang:fLang.value,text:fText.box.checked,discord:fDisc.box.checked,archived:fArch.box.checked}}
  function doSearch(){var f=filter();G.last=f;note(res,tx('guides.working'));pv.hidden=true;
    var b={dir:G.dir,limit:100};for(var k in f)b[k]=f[k];
    api('/api/x/guides/search',b,wn('guides.btn.search')).then(function(j){res.textContent='';
      if(!j.total){note(res,f.tab==='history'?tx('guides.hist.none'):tx('guides.res.none'));exBox.hidden=true;return}
      res.appendChild(el('p',null,j.total>j.shown?tx('guides.res.shown',{n:j.total,s:j.shown}):tx('guides.res.count',{n:j.total})));
      j.rows.forEach(function(r){res.appendChild(rowCard(r))});
      exportCard()}).catch(function(e){fail(res,e)})}
  function rowCard(r){var c=el('div');c.style.borderLeft='3px solid var(--acc)';c.style.padding='4px 8px';c.style.margin='6px 0';
    var t=el('div');t.appendChild(link(r.url,r.title));
    t.appendChild(badge(tx('guides.f.tab.'+r.tab),r.tab==='guides'?'var(--goodbg)':r.tab==='tools'?'var(--infobg)':r.tab==='history'?'var(--silent)':'var(--chip)'));
    if(r.discord)t.appendChild(badge(tx('guides.res.discord'),'var(--violbg)'));
    if(r.archiveUrl)t.appendChild(badge(tx('guides.res.archived',{c:r.captured||'?'}),'var(--silent)'));
    if(r.hasText)t.appendChild(badge(tx('guides.res.hastext'),'var(--review)'));
    c.appendChild(t);c.appendChild(el('div','hint',meta(r)));
    if(r.note)c.appendChild(el('div','hint',r.note));
    if(r.snippet){c.appendChild(el('div','hint',tx('guides.res.intext')));c.appendChild(el('div',null,r.snippet))}
    var b=el('div','row');b.appendChild(h('button',{type:'button',text:tx('guides.btn.preview'),onclick:function(){preview(r,c)}}));c.appendChild(b);
    return c}
  function preview(r,after){pv.hidden=false;note(pv,tx('guides.working'));after.parentNode.insertBefore(pv,after.nextSibling);
    api('/api/x/guides/show',{dir:G.dir,id:r.id,around:(G.last&&G.last.text&&G.last.q)?G.last.q.split(/\s+/)[0]:''}).then(function(j){pv.textContent='';
      pv.appendChild(el('h4',null,tx('guides.pv.title')+': '+j.title));
      var top=el('div','row');top.appendChild(link(j.url,tx('guides.btn.open')));pv.appendChild(top);
      if(j.archive){var ar=el('div',null,tx('guides.pv.archive',{o:j.archive.original||'?',c:j.archive.captured||'?'})+' ');ar.appendChild(link(j.archive.archiveUrl,tx('guides.pv.archiveOpen')));pv.appendChild(ar)}
      if(j.copySnapshot)pv.appendChild(el('div','hint',tx('guides.pv.copy',{c:j.copySnapshot==='unknown'?'?':j.copySnapshot.slice(0,4)+'-'+j.copySnapshot.slice(4,6)+'-'+j.copySnapshot.slice(6,8)})));
      if(j.textSource)pv.appendChild(el('div','hint',tx(j.textSource.which==='own'?'guides.pv.src.own':'guides.pv.src.builtin')));
      if(!j.hasText){pv.appendChild(el('p','hint',tx('guides.pv.none')));return}
      pv.appendChild(el('div','hint',tx('guides.pv.lang')));
      var pre=el('pre',null,(j.textFrom?'... ':'')+j.text);pre.style.whiteSpace='pre-wrap';pre.style.maxHeight='360px';pre.style.overflow='auto';pre.style.border='1px solid var(--line)';pre.style.padding='6px';pv.appendChild(pre);
      if(j.more)pv.appendChild(el('p','hint',tx('guides.pv.more')))}).catch(function(e){fail(pv,e)})}
  // export: count first (nothing written), then pick a folder and save
  // built once (a card of blocks); each new search shows it again reset
  var fmt=sel([['csv','CSV'],['md','Markdown'],['json','JSON']],tx('guides.ex.fmt'));
  var msg=el('div');var row=h('div',{class:'row',blk:'search.export.btns','data-blkname':tx('guides.b.exbtns')},[label(tx('guides.ex.fmt'),fmt)]);
  var exBox=card('search.export',[blk('search.export.title',[el('h4',null,tx('guides.ex.title'))]),row,blk('search.export.msg',[msg],{name:tx('guides.b.exmsg')})],{name:tx('guides.ex.title')});
  exBox.hidden=true;sp.appendChild(exBox);
  function exportCard(){exBox.hidden=false;fmt.value='csv';msg.textContent='';save.disabled=true}
    var save=h('button',{type:'button',class:'primary',text:tx('guides.ex.pick'),disabled:true,onclick:function(){
      pick('dir','',function(folder){note(msg,tx('guides.working'));
        api('/api/x/guides/export',{dir:G.dir,fmt:fmt.value,filter:G.last,folder:folder}).then(function(j){msg.textContent='';
          msg.appendChild(el('p','ok',tx('guides.ex.done',{n:j.count,p:j.out})));msg.appendChild(el('p','hint',tx('guides.ex.next')));toast(tx('guides.ex.done',{n:j.count,p:j.out}))
        }).catch(function(e){fail(msg,e)})})}});
    row.appendChild(h('button',{type:'button',text:tx('guides.ex.check'),onclick:function(){note(msg,tx('guides.working'));
      api('/api/x/guides/export',{dir:G.dir,fmt:fmt.value,filter:G.last}).then(function(j){note(msg,tx('guides.ex.count',{n:j.count,f:j.fmt.toUpperCase()}));save.disabled=false}).catch(function(e){fail(msg,e)})}}));
    fmt.addEventListener('change',function(){save.disabled=true;msg.textContent=''});
    row.appendChild(save);

  // ---- FAQ
  var fp=panes.faq;fp.appendChild(blk('faq.intro',[el('p','hint',tx('guides.faq.intro'))]));
  var faqWords=h('input',{type:'text',size:'30','aria-label':tx('guides.f.words'),placeholder:tx('guides.f.words')});
  fp.appendChild(h('div',{class:'row',blk:'faq.q','data-blkname':tx('guides.b.words')},[faqWords,h('button',{type:'button',class:'primary',text:tx('guides.btn.search'),onclick:function(){loadFaq()}})]));
  // searchKit: index = the FAQ questions (/titles, with the search box's titles), Browse = the guide index folder (gBrowse: a picked
  // page text gives its row's title); a pick asks the FAQ for it
  searchKit(faqWords,{key:'guides.faq',index:function(s,done){titles(function(t){hitsOf(t.faq,s,done)})},browse:gBrowse,
    onPick:function(v,it,from){if(from==='browse'){titleOf(v,function(t){faqWords.value=t;loadFaq()});return}faqWords.value=v;loadFaq()}});
  faqWords.addEventListener('keydown',function(e){if(!e._sk&&e.key==='Enter')loadFaq()});
  var faqRes=el('div');fp.appendChild(blk('faq.res',[faqRes],{name:tx('guides.b.faqres')}));
  function loadFaq(){if(!G.st||!G.st.found)return;note(faqRes,tx('guides.working'));
    api('/api/x/guides/faq',{dir:G.dir,q:faqWords.value.trim(),discord:fDisc.box.checked},wn('guides.tab.faq')).then(function(j){faqRes.textContent='';
      if(!j.rows.length){note(faqRes,tx('guides.faq.none'));return}
      j.rows.forEach(function(f){var c=el('div','card');c.appendChild(el('div','hint',[f.game,f.comp,f.lang].filter(function(x){return x}).join(' / ')));
        c.appendChild(el('b',null,f.q));var a=el('div',null,f.a);a.style.whiteSpace='pre-wrap';a.style.margin='4px 0';c.appendChild(a);
        var s=el('div','hint',tx('guides.faq.source')+': '+(f.sourceName||'')+' ');if(f.sourceUrl)s.appendChild(link(f.sourceUrl));c.appendChild(s);faqRes.appendChild(c)})
    }).catch(function(e){fail(faqRes,e)})}

  // ---- tools by sub-topic
  var tp=panes.tools;var toolRes=el('div');tp.appendChild(blk('tools.res',[toolRes],{name:tx('guides.b.toolres')}));
  function loadTools(){if(!G.st||!G.st.found)return;note(toolRes,tx('guides.working'));
    api('/api/x/guides/tools',{dir:G.dir,discord:fDisc.box.checked},wn('guides.tab.tools')).then(function(j){toolRes.textContent='';
      var n=0;j.groups.forEach(function(g){n+=g.rows.length});
      toolRes.appendChild(el('p','hint',tx('guides.tools.intro',{n:n})));
      j.groups.forEach(function(g){var d=el('details');d.appendChild(el('summary',null,g.sub+' ('+g.rows.length+')'));
        g.rows.forEach(function(r){var x=el('div');x.style.margin='4px 0 4px 12px';x.appendChild(link(r.url,r.title));if(r.discord)x.appendChild(badge(tx('guides.res.discord'),'var(--violbg)'));
          x.appendChild(el('div','hint',meta(r)));d.appendChild(x)});toolRes.appendChild(d)})
    }).catch(function(e){fail(toolRes,e)})}

  // ---- make what ARSENAL can't
  var gp=panes.gaps;var gapRes=el('div');gp.appendChild(blk('gaps.intro',[el('p',null,tx('guides.gaps.intro'))]));gp.appendChild(blk('gaps.res',[gapRes],{name:tx('guides.b.gapres')}));
  function linkList(title,items){var d=el('div');d.appendChild(el('b',null,title));var ul=el('ul');
    items.forEach(function(it){var li=el('li');li.appendChild(link(it.url,it.title));if(it.game)li.appendChild(el('span','hint',' '+it.game+(it.sub?' / '+it.sub:'')));if(it.discord)li.appendChild(badge(tx('guides.res.discord'),'var(--violbg)'));ul.appendChild(li)});
    d.appendChild(ul);return d}
  function loadGaps(){note(gapRes,tx('guides.working'));
    api('/api/x/guides/gaps'+q({dir:G.dir,lang:LANG}),undefined,wn('guides.tab.gaps')).then(function(j){gapRes.textContent='';
      var w=el('div',null,j.linkNote);w.style.border='1px solid var(--warnl)';w.style.padding='6px 10px';w.style.borderRadius='4px';w.style.margin='6px 0';gapRes.appendChild(w);
      if(!j.indexed)gapRes.appendChild(el('p','hint',tx('guides.gaps.noindex')));
      j.gaps.forEach(function(g){var c=el('div','card');c.appendChild(el('h3',null,g.title));c.appendChild(el('p',null,g.what));
        if(g.guides.length)c.appendChild(linkList(tx('guides.gaps.guides'),g.guides));
        if(g.tools.length)c.appendChild(linkList(tx('guides.gaps.tools'),g.tools));else c.appendChild(el('p','hint',tx('guides.gaps.notool')));
        var af=el('div','row');af.appendChild(el('b',null,tx('guides.gaps.after')+': '));af.appendChild(el('span',null,g.after+' '));
        af.appendChild(h('button',{type:'button',text:tx('guides.gaps.go'),onclick:function(){show(g.page)}}));c.appendChild(af);
        var ai=el('details');ai.appendChild(el('summary',null,tx('guides.gaps.ai')));
        g.ai.forEach(function(a){var x=el('div');x.style.margin='4px 0 4px 12px';x.appendChild(el('b',null,a.name+' '));x.appendChild(el('span',null,a.what));x.appendChild(el('div','hint',a.hint));ai.appendChild(x)});
        ai.appendChild(el('p','hint',j.aiNote));c.appendChild(ai);gapRes.appendChild(c)})
    }).catch(function(e){fail(gapRes,e)})}

  // ---- where the index comes from (offline)
  var srcRes=el('div');panes.sources.appendChild(blk('sources.intro',[el('p',null,tx('guides.src.intro'))]));panes.sources.appendChild(blk('sources.res',[srcRes],{name:tx('guides.b.srcres')}));
  function table(rows){var t=el('table');rows.forEach(function(r){var tr=el('tr');r.forEach(function(c,i){var td=el('td',null,String(c));td.style.padding='2px 8px';if(i===0)td.style.textAlign='right';tr.appendChild(td)});t.appendChild(tr)});return t}
  function loadSources(){if(!G.st||!G.st.found)return;note(srcRes,tx('guides.working'));
    api('/api/x/guides/sources',{dir:G.dir},wn('guides.tab.sources')).then(function(j){srcRes.textContent='';
      srcRes.appendChild(el('h3',null,tx('guides.src.origins')));
      srcRes.appendChild(table(j.origins.map(function(o){return [o.rows,tx('guides.src.o.'+(['index','foreign','wayback','discord','added'].indexOf(o.source)>=0?o.source:'other')),tx('guides.src.withtext',{t:o.withText})]})));
      var a=j.archives;srcRes.appendChild(el('h3',null,tx('guides.src.arch.title')));
      srcRes.appendChild(el('p',null,tx('guides.src.arch',{n:a.rows,s:a.sites,a:a.firstYear||'?',b:a.lastYear||'?',t:a.withText})));
      srcRes.appendChild(table(Object.keys(a.forums).sort(function(x,y){return a.forums[y]-a.forums[x]}).map(function(k){return [a.forums[k],k]})));
      srcRes.appendChild(el('p','hint',tx('guides.src.history',{n:j.history})));
      srcRes.appendChild(el('h3',null,tx('guides.src.sites',{n:j.siteCount})));
      srcRes.appendChild(table(j.sites.map(function(s){return [s.rows,s.site,(s.archived?tx('guides.src.archived',{a:s.archived})+', ':'')+tx('guides.src.withtext',{t:s.withText})]})));
      if(j.discordServers.length)srcRes.appendChild(el('p','hint',tx('guides.src.discord',{l:j.discordServers.map(function(d){return d.name+' ('+d.rows+')'}).join(', ')})));
      srcRes.appendChild(el('h3',null,tx('guides.src.pages')));
      j.pageSources.forEach(function(p,i){srcRes.appendChild(el('div',null,tx(i===0?'guides.src.pbuiltin':'guides.src.pown',{n:p.missing?tx('guides.src.pnone'):p.pages})+(p.where?'  '+p.where:'')))})
    }).catch(function(e){fail(srcRes,e)})}

  // ---- update the index: fetch public pages (goes online only from Start, after a dry run the user saw)
  // built once (blocks keep their place in the profile); upShow resets it as a fresh pane each time the tab opens
  var up=panes.update,U={plan:null,timer:null};
  var upW=el('div',null,tx('guides.up.intro'));upW.style.border='1px solid var(--warnl)';upW.style.padding='6px 10px';upW.style.borderRadius='4px';upW.style.margin='6px 0';up.appendChild(blk('update.intro',[upW]));
  var upNeed=blk('update.need',[el('p',null,tx('guides.up.needdir')),h('button',{type:'button',class:'primary',text:tx('guides.nf.pick'),onclick:pickDir})],{name:tx('guides.b.upneed')});up.appendChild(upNeed);
  var upWhere=el('p','hint');
  var mode=sel([['missing',tx('guides.up.mode.missing')],['filter',tx('guides.up.mode.filter')]],tx('guides.up.mode'));
  var lim=h('input',{type:'number',min:'1',max:'200',value:'25','aria-label':tx('guides.up.limit')});lim.style.width='5em';
  var plan=el('div');var prog=el('div');
    var tryB=h('button',{type:'button',class:'primary',text:tx('guides.up.try'),onclick:function(){U.plan=null;startB.disabled=true;note(plan,tx('guides.working'));
      api('/api/x/guides/update/plan',{dir:G.dir,mode:mode.value,limit:lim.value,filter:G.last||filter()},wn('guides.up.try')).then(function(j){plan.textContent='';U.plan=j;
        if(!j.count){plan.appendChild(el('p',null,tx('guides.up.none')));return}
        plan.appendChild(el('p',null,tx('guides.up.plan',{n:j.count,s:Object.keys(j.hosts).length,t:j.minSeconds,k:j.skipped.known,o:j.skipped.overLimit})));
        plan.appendChild(el('b',null,tx('guides.up.sites')));
        var ul=el('ul');Object.keys(j.hosts).forEach(function(k){ul.appendChild(el('li',null,k+' ('+j.hosts[k]+')'))});plan.appendChild(ul);
        var d=el('details');d.appendChild(el('summary',null,tx('guides.up.list',{n:j.count})));j.rows.forEach(function(r){var x=el('div','hint',r.kind+'  ');x.appendChild(link(r.url,r.title||r.url));d.appendChild(x)});plan.appendChild(d);
        startB.disabled=false}).catch(function(e){fail(plan,e)})}});
    var startB=h('button',{type:'button',text:tx('guides.up.start'),disabled:true,onclick:function(){if(!U.plan)return;startB.disabled=true;tryB.disabled=true;
      api('/api/x/guides/update/start',{dir:G.dir,token:U.plan.token}).then(function(){U.plan=null;poll()}).catch(function(e){fail(prog,e);tryB.disabled=false})}});
    var stopB=h('button',{type:'button',text:tx('guides.up.stop'),disabled:true,onclick:function(){api('/api/x/guides/update/stop',{}).then(function(){note(prog,tx('guides.up.stopping'))}).catch(function(e){fail(prog,e)})}});
    mode.addEventListener('change',function(){U.plan=null;startB.disabled=true;plan.textContent=''});lim.addEventListener('change',function(){U.plan=null;startB.disabled=true;plan.textContent=''});
  var upWith=[blk('update.where',[upWhere],{name:tx('guides.b.upwhere')}),
    h('div',{class:'row',blk:'update.opts',box:'row','data-blkname':tx('guides.b.upopts')},[fld('update.opts.mode',tx('guides.up.mode'),mode),fld('update.opts.limit',tx('guides.up.limit'),lim)]),
    h('div',{class:'row',blk:'update.btns','data-blkname':tx('guides.b.upbtns')},[tryB,startB,stopB]),
    blk('update.plan',[plan],{name:tx('guides.b.plan')}),blk('update.prog',[prog],{name:tx('guides.b.prog')}),blk('update.again',[el('p','hint',tx('guides.up.again'))])];
  upWith.forEach(function(b){up.appendChild(b)});
  function upShow(){var has=!!G.dir;upNeed.hidden=has;upWith.forEach(function(b){b.hidden=!has});if(!has)return;
    upWhere.textContent=tx('guides.up.where',{d:G.dir});
    U.plan=null;mode.value='missing';lim.value='25';plan.textContent='';prog.textContent='';tryB.disabled=false;startB.disabled=true;stopB.disabled=true;
    poll()}
    function draw(j){prog.textContent='';if(!j||(!j.running&&!j.result&&!j.error))return;
      stopB.disabled=!j.running;tryB.disabled=!!j.running;
      if(j.running)prog.appendChild(el('p',null,j.total?tx('guides.up.progress',{n:j.done,t:j.total}):tx('guides.working')));
      if(j.error)prog.appendChild(el('p','err',tx('guides.err',{m:j.error})));
      if(j.result){prog.appendChild(el('p','ok',tx(j.result.stopped?'guides.up.stopped':'guides.up.done',{n:j.result.saved,l:j.result.later})));
        prog.appendChild(el('div','hint',tx('guides.up.results')+': '+Object.keys(j.result.verdicts).map(function(k){return k+' '+j.result.verdicts[k]}).join(', ')))}
      if(j.log&&j.log.length){var pre=el('pre',null,j.log.join('\n'));pre.style.whiteSpace='pre-wrap';pre.style.maxHeight='200px';pre.style.overflow='auto';prog.appendChild(pre)}}
    // the 1 s read while an update runs waits while this page or the window is hidden (pollLater, page.js): one read when it is seen again
    function poll(){if(typeof pollStop==='function')pollStop(U.timer);else clearTimeout(U.timer);api('/api/x/guides/update/progress').then(function(j){draw(j);if(j.running)U.timer=typeof pollLater==='function'?pollLater('guides',poll,1000):setTimeout(poll,1000);else if(j.result)loadStatusQuiet()}).catch(function(e){fail(prog,e)})}
  function loadStatusQuiet(){api('/api/x/guides/status'+q({dir:G.dir})).then(function(j){if(j.found){G.st=j;head.firstChild&&(head.firstChild.textContent=tx('guides.at',{d:j.dir,b:j.built||'?',n:j.rows,p:j.pages}))}}).catch(function(){})}

  G.tab=LS.get('guides.tab','search');if(!panes[G.tab])G.tab='search';
  // view(v): open on inner tab v (show('guides','tools') from the hand-over buttons). Before the index status is in, G.tab is where loadStatus lands;
  // with no index the tabs that need it stay off and loadStatus shows Gaps (showTab saves gaps as the tab, so a v asked before that reply is not kept).
  // A view asked before this page was built counts too.
  out.view=function(v){v=String(v||'');if(!panes[v])return;G.tab=v;LS.set('guides.tab',v);if(G.st&&(G.st.found||!needIndex(v)))showTab(v)};
  var v0=typeof S!=='undefined'&&S&&S.view?S.view.guides:'';if(v0&&panes[v0])G.tab=v0;
  // lazy: the index status is asked at the first show (show0 calls refresh, then focus), not while the page is built; a request in flight is not sent twice
  out.refresh=function(){if(!G.asked)loadStatus();if(G.st&&G.st.found&&G.kind!=null)pickGame()};
  out.focus=function(){if(!G.st&&!G.asking)loadStatus()};
  return out;
};
`;
