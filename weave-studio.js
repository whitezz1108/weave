/* Presentation controller. Conversation and graph data remain in their existing stores. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),app=$('app');
  const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease='cubic-bezier(.2,.8,.2,1)',sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const paths={new:'M12 5v14M5 12h14',chat:'M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z',map:'M5 12h14M12 5v14M3 10h4v4H3zM10 3h4v4h-4zM17 10h4v4h-4zM10 17h4v4h-4z',history:'M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2',shape:'M4 18 12 4l8 14H4Zm2-2 12 0M12 4v14',bolt:'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',doc:'M6 2h8l4 4v16H6zM14 2v4h4M9 12h6M9 16h6'};
  const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';
  const mark='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 7v13a5 5 0 0 0 10 0V8m-5-1v13a5 5 0 0 0 10 0V8m-5-1v13a5 5 0 0 0 10 0V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const legacy=document.createElement('div');legacy.id='legacyUI';legacy.hidden=true;document.body.append(legacy);
  const sidebar=document.querySelector('.sidebar');
  const history=document.createElement('section');history.id='historyPopover';history.className='history-popover';history.setAttribute('aria-label','最近对话');history.innerHTML='<div class="history-head"><span>最近对话</span><button id="closeHistory" aria-label="关闭历史记录">×</button></div>';
  history.append($('chatHistoryWrap'));document.body.append(history);
  while(sidebar.firstChild)legacy.append(sidebar.firstChild);
  sidebar.innerHTML='<button class="rail-mark" id="weaveHome" aria-label="Weave">'+mark+'</button><button class="rail-button rail-new" id="railNew" data-tip="新对话" aria-label="新对话">'+icon('new')+'</button><button class="rail-button active" id="railChat" data-tip="对话" aria-label="对话">'+icon('chat')+'</button><button class="rail-button" id="railMap" data-tip="看见结构" aria-label="看见结构">'+icon('map')+'<span class="map-plus" aria-hidden="true">+1</span></button><button class="rail-button" id="railDispatch" data-tip="任务分发" aria-label="任务分发">'+icon('bolt')+'</button><button class="rail-button" id="railExport" data-tip="导出文档" aria-label="导出文档">'+icon('doc')+'</button><button class="rail-button" id="railHistory" data-tip="历史记录" aria-label="历史记录">'+icon('history')+'</button><div class="rail-gap"></div><button class="rail-avatar" id="railSettings" aria-label="对话设置">W</button>';
  const topbar=document.querySelector('.topbar');while(topbar.firstChild)legacy.append(topbar.firstChild);
  // setView updates this hidden strong; the visible control is a three-position semantic scale.
  topbar.innerHTML='<div class="topbar-left"><span class="wordmark">weave</span><strong></strong><button class="mode-indicator" id="modeIndicator" title="示例对话使用预设回答；点击更改对话设置。">ⓘ</button></div><div class="topbar-right"><nav class="semantic-control" aria-label="思考视图"><button data-semantic="chat" class="active">对话</button><div class="semantic-track"><button data-semantic="chat" aria-label="对话视图" class="active"></button><button data-semantic="hybrid" aria-label="对话与结构批注"></button><button data-semantic="map" aria-label="结构视图"></button></div><button data-semantic="map">结构</button></nav><button class="topbar-menu" id="pageMore" aria-label="更多">···</button></div>';
  // 对话标题移到 weave 标志右侧；「看见结构 / Reveal the map」移到右上操作区。
  const topbarLeft=topbar.querySelector('.topbar-left');
  const topicTitle=$('chatTopicTitle');topicTitle.classList.add('topbar-title');
  topbarLeft.insertBefore(topicTitle,topbarLeft.querySelector('strong'));
  topbar.querySelector('.topbar-right').insertBefore($('convertChatButton'),$('pageMore'));
  const settings=document.createElement('section');settings.id='settingsPopover';settings.className='settings-popover';settings.innerHTML='<div class="history-head"><span>对话设置</span><button id="closeSettings" aria-label="关闭设置">×</button></div><label id="chatModeLabel">回复来源</label><p>示例使用预设回答。启动本地服务后，可选择 Claude Code。</p><p>真实 Claude Code 会话在上下文接近上限时会自动整理较早内容；完整记录仍保留。</p>';
  $('chatModeLabel');settings.querySelector('label').append($('chatModeSelect'));settings.append($('connectButton'));document.body.append(settings);
  const options=document.createElement('button');options.type='button';options.className='composer-options';options.textContent='···';options.setAttribute('aria-label','对话设置');options.onclick=()=>settings.classList.toggle('show');document.querySelector('.chat-compose-bottom').prepend(options);
  const glass=document.createElement('div');glass.className='chat-glass';glass.setAttribute('aria-hidden','true');$('chatView').prepend(glass);
  const empty=document.createElement('div');empty.className='empty-welcome';empty.innerHTML='<h1>一个念头，从这里展开。</h1><p>跟着问题走，随时回到原处。</p><button class="sample-link" id="openExample">打开一段示例对话 ↗</button>';$('chatView').prepend(empty);
  $('chatInput').placeholder='继续这个想法…';$('convertChatButton').innerHTML=icon('shape')+'看见结构';
  const sheet=document.createElement('section');sheet.id='executionSheet';sheet.className='execution-sheet';sheet.setAttribute('aria-label','运行代理');sheet.innerHTML='<div class="execution-head"><span>运行代理</span><button id="closeExecution" aria-label="关闭运行面板">×</button></div>';
  sheet.append(document.querySelector('.inspector-tabs'),document.querySelector('.inspector-content'));document.body.append(sheet);
  document.querySelector('.tab[data-tab="overview"]').textContent='任务';document.querySelector('.tab[data-tab="logs"]').textContent='日志';document.querySelector('.tab[data-tab="accept"]').textContent='记录与验收';
  // Preserve count sinks for the execution controller, without putting metrics in the main UI.
  for(const id of ['logCount','cpCount'])if(!$(id)){let span=document.createElement('span');span.id=id;legacy.append(span)}
  document.querySelector('.inspector-top').insertAdjacentHTML('beforeend','<button id="closeInspector" class="inspector-close" aria-label="关闭想法详情">×</button>');
  const state={view:'chat',busy:false,scroll:0,threadId:null,animations:[]};
  const setControls=view=>{state.view=view;document.querySelectorAll('[data-semantic]').forEach(b=>{b.classList.toggle('active',b.dataset.semantic===view);b.setAttribute('aria-pressed',String(b.dataset.semantic===view))});$('railChat').classList.toggle('active',view!=='map');$('railMap').classList.toggle('active',view==='map')};
  function closeSurfaces(){history.classList.remove('show');settings.classList.remove('show');app.classList.remove('inspector-open');sheet.classList.remove('show');$('dispatchSheet')?.classList.remove('show');$('exportPopover')?.classList.remove('show')}
  function snapshotCurrent(){const root=WeaveApp.getRoot();const owner=WeaveChat.getThreads().find(t=>t.id===root?.sourceChatThreadId);if(owner){owner.ideaMap=WeaveApp.getSnapshot();WeaveChat.save()}else if(WeaveApp.hasSaved){try{localStorage.setItem('weave-preserved-map',JSON.stringify(WeaveApp.getSnapshot()))}catch(_){}}}
  function buildGraph(candidates){
    snapshotCurrent();const thread=WeaveChat.getCurrent();
    if(thread.ideaMap&&WeaveApp.getRoot()?.sourceChatThreadId!==thread.id)WeaveApp.restoreSnapshot(thread.ideaMap);
    WeaveApp.syncIdeas(candidates,thread.id);thread.ideaMap=WeaveApp.getSnapshot();WeaveChat.save();
  }
  function annotate(){
    document.querySelectorAll('.structure-note').forEach(n=>n.remove());if(state.view!=='hybrid')return;
    const result=WeaveChat.getCandidates();const labels={TOPIC:'主问题',QUESTION:'待解问题',INSIGHT:'留下的想法',DECISION:'决定',IDEA:'想法',BRANCH:'旁支',ACTION:'下一步'};
    const seen=new Set();for(const n of result.nodes){let id=n.sourceIds?.[0];if(seen.has(id))continue;seen.add(id);let article=[...document.querySelectorAll('[data-message]')].find(e=>e.dataset.message===id);if(!article)continue;let note=document.createElement('button');note.className='structure-note';note.title=n.title;note.innerHTML='<span></span>';note.firstChild.textContent=WeaveI18n.t(labels[n.kind]||'想法');note.append(document.createTextNode(n.title.slice(0,32)));note.onclick=()=>reveal();article.append(note)}
  }
  async function conversation(hybrid=false){
    if(state.busy)return;closeSurfaces();snapshotCurrent();
    const wasMap=state.view==='map';WeaveChat.setView('chat');app.classList.toggle('hybrid-mode',hybrid);setControls(hybrid?'hybrid':'chat');
    if(wasMap){$('chatScroll').scrollTop=state.scroll;await $('chatView').animate([{opacity:.1,transform:'scale(.985)'},{opacity:1,transform:'scale(1)'}],{duration:reduce()?100:320,easing:ease}).finished}
    annotate();
  }
  function sourceElement(candidate){
    if(candidate.explorationId){let anchor=[...document.querySelectorAll('[data-anchor]')].find(e=>e.dataset.anchor===candidate.explorationId);if(anchor)return anchor}
    let a=[...document.querySelectorAll('[data-message]')].find(e=>candidate.sourceIds?.includes(e.dataset.message));return a?.querySelector('.chat-message-text');
  }
  async function reveal(){
    if(state.busy||state.view==='map')return;
    const thread=WeaveChat.getCurrent();if(!thread.messages.length){$('chatInput').focus();return}
    state.busy=true;state.scroll=$('chatScroll').scrollTop;closeSurfaces();window.WeaveFocus?.dismiss();
    app.classList.remove('hybrid-mode','legacy-map-view');$('chatView').inert=true;app.setAttribute('aria-busy','true');setControls('hybrid');document.querySelectorAll('.structure-note').forEach(e=>e.remove());
    const candidates=WeaveChat.getCandidates().nodes,overlay=document.createElement('div');overlay.className='shape-overlay';overlay.setAttribute('aria-hidden','true');document.body.append(overlay);
    const caption=document.createElement('div');caption.className='shape-caption';caption.textContent='想法，开始显露结构';overlay.append(caption);
    const sourceRects=candidates.map(c=>({c,el:sourceElement(c)}));
    try{
      app.classList.add('shape-transition','shape-dim');
      sourceRects.forEach(({el})=>el?.closest('.chat-message')?.classList.add('shape-source'));
      await sleep(reduce()?30:300);
      const view=$('chatScroll').getBoundingClientRect();
      const moving=sourceRects.slice(0,16).map(({c,el},i)=>{
        const r=el?.getBoundingClientRect();const visible=r&&r.bottom>view.top&&r.top<view.bottom;
        const x=visible?r.left:view.left+view.width*.48,y=visible?Math.max(view.top+8,Math.min(r.top,view.bottom-48)):view.bottom+25+i*8;
        let clone=document.createElement('div');clone.className='shape-clone';clone.textContent=c.title;clone.style.cssText='left:'+x+'px;top:'+y+'px;width:'+(c.id==='idea-root'?244:234)+'px;';overlay.append(clone);
        clone.animate([{opacity:0,transform:'translateY(7px)'},{opacity:visible?1:0,transform:'translateY(0)'}],{duration:reduce()?40:400,delay:reduce()?0:i*25,easing:ease,fill:'both'});
        return {clone,c,x,y,visible};
      });
      await sleep(reduce()?70:750);
      buildGraph(candidates);await frame();WeaveApp.fitMap();await frame();
      caption.textContent='沿着来处，彼此相连';app.classList.add('shape-spatial');
      const vp=$('graphViewport').getBoundingClientRect();
      const threadLinks=moving.filter(m=>m.c.explorationId).map(m=>({child:m,parent:moving.find(p=>p.c.id===m.c.parent)||moving[0]}));
      const links=document.createElementNS('http://www.w3.org/2000/svg','svg');links.style.cssText='position:fixed;inset:0;width:100%;height:100%;overflow:visible';overlay.prepend(links);
      threadLinks.forEach(link=>{link.path=document.createElementNS('http://www.w3.org/2000/svg','path');link.path.setAttribute('fill','none');link.path.setAttribute('stroke','#b7a6ff70');link.path.setAttribute('stroke-width','1');links.append(link.path)});
      let tracing=true;const started=performance.now();
      function trace(){if(!tracing)return;const progress=Math.min(1,(performance.now()-started)/800);for(const link of threadLinks){const p=link.parent.clone.getBoundingClientRect(),c=link.child.clone.getBoundingClientRect(),x=p.right,y=p.top+p.height/2,ex=c.left,ey=c.top+c.height/2,mid=(x+ex)/2;link.path.setAttribute('d','M '+x+' '+y+' C '+mid+' '+y+', '+mid+' '+ey+', '+ex+' '+ey);link.path.style.opacity=reduce()?1:Math.max(0,progress-.25)}requestAnimationFrame(trace)}
      requestAnimationFrame(trace);
      const flights=moving.map(({clone,c,x,y,visible},i)=>{
        const id=c.id==='idea-root'?'root':'chat-'+c.id,target=[...document.querySelectorAll('.graph-node')].find(n=>n.dataset.node===id);if(!target)return Promise.resolve();const r=target.getBoundingClientRect();
        const cr=clone.getBoundingClientRect();clone.getAnimations().forEach(a=>a.cancel());return clone.animate([{transform:'translate(0,0) scale(1)',opacity:visible?1:0},{transform:'translate('+(r.left-x)+'px,'+(r.top-y)+'px) scale('+(r.width/cr.width)+','+(r.height/cr.height)+')',opacity:1}],{duration:reduce()?130:1050,delay:reduce()?0:Math.min(i*24,200),easing:ease,fill:'forwards'}).finished;
      });
      await Promise.all(flights);tracing=false;
      app.classList.remove('shape-transition','shape-dim','shape-spatial');WeaveChat.setView('map');setControls('map');await frame();WeaveApp.fitMap();
      moving.forEach(({clone})=>clone.animate([{opacity:1},{opacity:0}],{duration:reduce()?70:200,fill:'forwards'}));
      app.classList.add('shape-reveal');document.querySelectorAll('.edge-base').forEach((e,i)=>e.style.animationDelay=(reduce()?0:i*50)+'ms');
      const world=$('graphWorld'),base=world.style.transform;world.animate([{transform:base+' scale(1.045)',opacity:.75},{transform:base+' scale(1)',opacity:1}],{duration:reduce()?80:650,easing:ease});
      caption.textContent='';await sleep(reduce()?100:650);
    }catch(error){console.error(error);WeaveChat.setView('chat');setControls('chat')}
    finally{$('chatView').inert=false;app.removeAttribute('aria-busy');overlay.remove();app.classList.remove('shape-transition','shape-dim','shape-spatial','shape-reveal');document.querySelectorAll('.shape-source').forEach(e=>e.classList.remove('shape-source'));state.busy=false;}
  }
  async function keepIdea(branch){
    const panel=$('explorePanel'),dest=$('railMap'),r=panel.getBoundingClientRect(),d=dest.getBoundingClientRect();
    if(!reduce()){
      const preview=document.createElement('div');preview.className='thread-kept-preview';preview.textContent=branch.quote;preview.style.left=r.left+25+'px';preview.style.top=r.top+80+'px';document.body.append(preview);
      const dx=d.left+d.width/2-r.left,dy=d.top+d.height/2-r.top;
      const a=panel.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate('+dx+'px,'+dy+'px) scale(.06)',opacity:0}],{duration:550,easing:ease,fill:'forwards'});
      await preview.animate([{transform:'translate(0,0)',opacity:1},{transform:'translate('+(d.left-r.left-25)+'px,'+(d.top-r.top-80)+'px) scale(.15)',opacity:0}],{duration:600,easing:ease,fill:'forwards'}).finished;
      preview.remove();a.cancel();
    }
    const badge=dest.querySelector('.map-plus');badge.classList.remove('show');void badge.offsetWidth;badge.classList.add('show');
  }
  function showExecution(){app.classList.remove('inspector-open');sheet.classList.add('show');sheet.querySelector('[data-tab=overview]').click();$('promptEditor').focus()}
  $('railNew').onclick=()=>{if(state.busy)return;closeSurfaces();window.WeaveFocus?.dismiss();WeaveChat.setView('chat');WeaveChat.makeThread();setControls('chat');app.classList.remove('hybrid-mode')};
  $('railChat').onclick=()=>state.view==='map'?conversation():history.classList.toggle('show');$('railHistory').onclick=()=>history.classList.toggle('show');$('closeHistory').onclick=()=>history.classList.remove('show');
  $('railMap').onclick=reveal;$('convertChatButton').onclick=reveal;
  $('weaveHome').onclick=$('openExample').onclick=()=>{if(state.busy)return;window.WeaveFocus?.dismiss();WeaveChat.openSample();setControls('chat');closeSurfaces();requestAnimationFrame(()=>$('chatScroll').scrollTop=0)};
  $('railSettings').onclick=$('modeIndicator').onclick=$('pageMore').onclick=()=>settings.classList.toggle('show');$('closeSettings').onclick=()=>settings.classList.remove('show');
  $('closeExecution').onclick=()=>sheet.classList.remove('show');$('closeInspector').onclick=()=>app.classList.remove('inspector-open');
  document.querySelectorAll('[data-semantic]').forEach(b=>b.onclick=()=>b.dataset.semantic==='map'?reveal():conversation(b.dataset.semantic==='hybrid'));
  $('chatThreadList').addEventListener('click',()=>{history.classList.remove('show');app.classList.remove('hybrid-mode');setControls('chat')});
  $('graphNodes').addEventListener('pointerover',e=>{const n=e.target.closest('[data-node]');if(n)document.querySelectorAll('.edge-base').forEach(p=>p.classList.toggle('connected',p.dataset.from===n.dataset.node||p.dataset.to===n.dataset.node))});
  $('graphNodes').addEventListener('pointerout',()=>document.querySelectorAll('.edge-base.connected').forEach(p=>p.classList.remove('connected')));
  document.addEventListener('weave:node-selected',()=>{if(!app.classList.contains('chat-mode')&&!state.busy){app.classList.add('inspector-open');sheet.classList.remove('show')}});
  document.addEventListener('weave:run-agent',showExecution);
  document.addEventListener('weave:chat-rendered',()=>{if(!$('modeIndicator'))return;const t=WeaveChat.getCurrent();$('modeIndicator').textContent='ⓘ';$('modeIndicator').setAttribute('aria-label',t.mode==='real'?'回复来源：Claude Code':'回复来源：预设示例');$('modeIndicator').title=t.mode==='real'?'通过本机 Claude Code 回复':'当前回答为交互演示；点击更改来源';if(state.threadId!==t.id){state.threadId=t.id;window.WeaveFocus?.dismiss()}if(state.view==='hybrid')requestAnimationFrame(annotate)});
  document.addEventListener('weave:view-changed',e=>{if(!state.busy&&e.detail.view==='chat'&&state.view==='map'){setControls('chat');app.classList.remove('inspector-open')}});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.history-popover,#railChat,#railHistory'))history.classList.remove('show');if(!e.target.closest('.settings-popover,#railSettings,#modeIndicator,#pageMore,.composer-options'))settings.classList.remove('show');if(!e.target.closest('.dispatch-sheet,#railDispatch'))$('dispatchSheet')?.classList.remove('show');if(!e.target.closest('.export-popover,#railExport'))$('exportPopover')?.classList.remove('show')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSurfaces()});
  window.WeaveStudio={reveal,conversation,keepIdea,showExecution,annotate,isTransitioning:()=>state.busy};
  document.addEventListener('weave:language-changed',()=>{if(state.view==='hybrid')annotate()});
  snapshotCurrent();
  if(localStorage.getItem('weave-preserved-map')){const old=document.createElement('button');old.className='sample-link';old.textContent='打开既有图谱 ↗';old.onclick=()=>{if(state.busy)return;try{const snapshot=JSON.parse(localStorage.getItem('weave-preserved-map'));snapshotCurrent();WeaveApp.restoreSnapshot(snapshot);WeaveChat.setView('map');app.classList.add('legacy-map-view');setControls('map');closeSurfaces();requestAnimationFrame(()=>WeaveApp.fitMap())}catch(_){}};history.append(old)}
  requestAnimationFrame(()=>{$('chatScroll').scrollTop=0;state.threadId=WeaveChat.getCurrent().id});
})();
