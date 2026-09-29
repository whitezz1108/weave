/* A tangent belongs to one exact phrase in one message. Explorations can nest. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const chat=()=>window.WeaveChat;
  const current=()=>chat().getCurrent();
  const uid=()=>`branch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const msgId=()=>`m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const state={selection:null,branchId:null,busy:false,cueTimer:null,error:''};
  const tooltip=document.createElement('button');tooltip.id='exploreTooltip';tooltip.type='button';tooltip.textContent='旁边问问 ↗';document.body.append(tooltip);
  /* 当前探索（右列，可输入）；直接父层（中间列，只读）。更早层级收进路径导航。 */
  const panel=document.createElement('aside');panel.id='explorePanel';panel.setAttribute('aria-label','侧边探索');
  panel.innerHTML=`<div class="explore-head"><span class="explore-kicker">侧边探索</span><button id="exploreClose" aria-label="收起侧边探索">×</button></div>
    <div class="explore-path" id="explorePath" hidden></div>
    <div class="explore-source"><span>来自原回答</span><blockquote id="exploreQuote"></blockquote><p id="exploreContext"></p></div>
    <div class="explore-scroll" id="exploreScroll"><div class="explore-messages" id="exploreMessages"></div></div>
    <div class="explore-compose"><form id="exploreForm"><textarea id="exploreInput" rows="2" placeholder="继续追问…"></textarea><button id="exploreSend" aria-label="发送侧边问题">↑</button></form><p id="exploreMode"></p></div>
    <div class="explore-actions"><button id="explorePromote">保留为想法</button><button id="exploreReturn">返回原文 ↶</button></div>`;
  $('app').append(panel);
  const parentPanel=document.createElement('aside');parentPanel.id='parentPanel';parentPanel.setAttribute('aria-label','上一层探索');
  parentPanel.innerHTML=`<div class="explore-head"><span class="explore-kicker">上一层探索</span><button id="parentBack">‹ 回到这一层</button></div>
    <div class="explore-source"><span>来自上一层</span><blockquote id="parentQuote"></blockquote></div>
    <div class="explore-scroll" id="parentScroll"><div class="explore-messages" id="parentMessages"></div></div>`;
  panel.after(parentPanel);
  const cue=document.createElement('div');cue.id='returnCue';cue.innerHTML='<span>已回到刚才这句</span><button id="returnPromote">保留为想法 ↗</button>';$('chatView').append(cue);
  const mapCover=document.createElement('div');mapCover.id='focusMapEmpty';mapCover.innerHTML='<div class="focus-map-mark">◇</div><h2>值得留下的想法，会在这里相连。</h2><p>在对话中探索一个侧问题，回到原文，再把有价值的发现保留下来。</p><button id="focusMapBack">回到对话 →</button>';
  document.querySelector('.graph-panel').append(mapCover);
  $('focusMapBack').onclick=()=>chat().setView('chat');
  const inspector=document.createElement('div');inspector.id='focusInspector';
  document.querySelector('.inspector-heading').after(inspector);
  inspector.innerHTML='<div class="focus-field"><h3 id="focusIdeaTitle"></h3><p id="focusIdeaSummary"></p></div><div class="focus-field"><blockquote id="focusIdeaSource"></blockquote><button id="focusGoSource">回到原句 ↗</button></div><div class="idea-status" id="focusIdeaRelated"></div><div class="idea-actions"><button id="focusIdeaExplore">继续探索 ↗</button><button id="focusIdeaTask">交给代理</button><button id="focusIdeaMore" aria-label="更多想法操作">···</button></div><div class="idea-more" id="focusIdeaMenu"><button id="renameIdea">重命名</button><button id="branchIdea">添加分支</button><button id="foldIdea">折叠 / 展开</button><button id="deleteIdea" class="idea-delete">删除想法</button></div>';
  $('focusIdeaMenu').insertAdjacentHTML('beforeend','<label class="idea-parent-row">上级想法<select id="ideaParent" aria-label="上级想法"></select></label>');
  $('ideaParent').onchange=()=>{WeaveApp.moveIdea(WeaveApp.getSelected().id,$('ideaParent').value);updateInspector()};
  $('focusIdeaMore').onclick=()=>$('focusIdeaMenu').classList.toggle('show');
  $('deleteIdea').onclick=()=>{const node=WeaveApp.getSelected();if(!node||node.id==='root')return;$('focusIdeaMenu').classList.remove('show');WeaveApp.deleteIdea(node.id)};
  $('branchIdea').onclick=()=>$('addBranchButton').click();$('foldIdea').onclick=()=>$('toggleBranchButton').click();
  $('renameIdea').onclick=()=>{if($('renameIdeaInput'))return;const node=WeaveApp.getSelected(),input=document.createElement('input');input.id='renameIdeaInput';input.className='idea-title-input';input.value=node.title;input.setAttribute('aria-label','想法标题');$('focusIdeaTitle').after(input);input.focus();input.select();let done=false;const save=()=>{if(done)return;done=true;if(input.value.trim())WeaveApp.updateIdea(node.id,{title:input.value.trim().slice(0,70)});input.remove();updateInspector()};input.onblur=save;input.onkeydown=e=>{if(e.key==='Enter')save();if(e.key==='Escape'){done=true;input.remove()}}};
  document.querySelector('.inspector-label').firstChild.textContent='想法详情 ';
  $('focusGoSource').onclick=()=>chat().returnToSource();
  $('focusIdeaExplore').onclick=()=>{
    const node=window.WeaveApp.getSelected();const thread=threadById(node.sourceChatThreadId);
    if(!thread)return;
    chat().openThread(thread.id);
    const existing=branchById(node.explorationId);
    if(existing){gotoBranch(existing.id);return}
    const message=thread.messages.find(item=>node.sourceIds?.includes(item.id));
    if(!message)return;
    const quote=message.content.slice(0,70);
    open({threadId:thread.id,messageId:message.id,start:0,end:quote.length,quote,scrollTop:$('chatScroll').scrollTop});
  };
  $('focusIdeaTask').onclick=()=>document.dispatchEvent(new CustomEvent('weave:run-agent'));
  /* 来源连线：当前路径需要的连线（可见元素之间） */
  const strand=document.createElementNS('http://www.w3.org/2000/svg','svg');strand.id='threadStrand';strand.setAttribute('aria-hidden','true');document.body.append(strand);
  strand.style.display='none';
  let strandFrame;function scheduleStrand(){cancelAnimationFrame(strandFrame);strandFrame=requestAnimationFrame(()=>drawStrand())}
  $('chatScroll').addEventListener('scroll',scheduleStrand,{passive:true});window.addEventListener('resize',scheduleStrand);
  new ResizeObserver(scheduleStrand).observe($('chatMessages'));
  new ResizeObserver(scheduleStrand).observe(document.querySelector('.main-stage'));
  new ResizeObserver(scheduleStrand).observe($('exploreMessages'));
  new ResizeObserver(scheduleStrand).observe($('parentMessages'));
  function threadById(id){return chat().getThreads().find(thread=>thread.id===id)}
  function branches(){return current().explorations||[]}
  function active(){return branches().find(branch=>branch.id===state.branchId)}
  function branchById(id){return branches().find(branch=>branch.id===id)}
  function childrenOf(branchId){return branches().filter(branch=>(branch.parentId??null)===(branchId??null))}
  function chainOf(id){const out=[];let node=branchById(id),guard=0;while(node&&guard++<64){out.push(node);node=node.parentId?branchById(node.parentId):null}return out}
  function topLevelOf(branch){const chain=chainOf(branch.id);return chain[chain.length-1]||branch}
  function fromBranch(branch){return {threadId:branch.threadId,parentBranchId:branch.parentId??null,messageId:branch.messageId,start:branch.start,end:branch.end,quote:branch.quote,panelScroll:branch.panelScroll,scrollTop:branch.scrollTop}}
  function prefill(branch){
    return branch.messages.length?'':WeaveI18n.language==='en'?'What does “'+branch.quote.slice(0,70)+'” mean here?':'这里的「'+branch.quote.slice(0,70)+'」是什么意思？';
  }
  function persistViewState(){
    const branch=active();if(!branch)return;
    branch.draft=$('exploreInput').value;
    branch.panelScroll=$('exploreScroll').scrollTop;
    chat().save();
  }
  function rangeOffset(root,container,offset){
    const range=document.createRange();range.selectNodeContents(root);range.setEnd(container,offset);return range.toString().length;
  }
  function hideTooltip(){tooltip.classList.remove('show')}
  function selectionCandidate(){
    if(!$('app').classList.contains('chat-mode')||$('app').classList.contains('home-mode'))return null;
    const selection=window.getSelection();if(!selection||selection.isCollapsed||!selection.rangeCount)return null;
    const range=selection.getRangeAt(0);let node=range.commonAncestorContainer;
    if(node.nodeType===Node.TEXT_NODE)node=node.parentElement;
    const text=node?.closest?.('.chat-message.assistant .chat-message-text');
    if(text&&text.contains(range.startContainer)&&text.contains(range.endContainer)){
      const quote=selection.toString().trim();if(quote.length<2||quote.length>280)return null;
      const article=text.closest('[data-message]');if(!article)return null;
      const message=current().messages.find(item=>item.id===article.dataset.message);if(!message)return null;
      const start=rangeOffset(text,range.startContainer,range.startOffset),end=rangeOffset(text,range.endContainer,range.endOffset);
      if(message.content.slice(start,end).trim()!==quote)return null;
      return {threadId:current().id,parentBranchId:null,messageId:message.id,start,end,quote,scrollTop:$('chatScroll').scrollTop,rect:range.getBoundingClientRect()};
    }
    /* 在当前探索面板的回答里选中 → 开一层子探索 */
    const p=node?.closest?.('#explorePanel .explore-message.assistant p');
    if(p){
      const owner=active();if(!owner)return null;
      const message=(owner.messages||[]).find(item=>item.id===p.dataset.mid);if(!message)return null;
      const quote=selection.toString().trim();if(quote.length<2||quote.length>280)return null;
      const start=rangeOffset(p,range.startContainer,range.startOffset),end=rangeOffset(p,range.endContainer,range.endOffset);
      if(message.content.slice(start,end).trim()!==quote)return null;
      return {threadId:current().id,parentBranchId:owner.id,messageId:message.id,start,end,quote,panelScroll:$('exploreScroll').scrollTop,scrollTop:$('chatScroll').scrollTop,rect:range.getBoundingClientRect()};
    }
    return null;
  }
  function showTooltip(){
    const candidate=selectionCandidate();if(!candidate){hideTooltip();return}
    state.selection=candidate;
    const rect=candidate.rect;
    tooltip.style.left=Math.min(window.innerWidth-184,Math.max(14,rect.left+rect.width/2-78))+'px';
    tooltip.style.top=Math.max(12,rect.top-48)+'px';
    tooltip.classList.add('show');
  }
  tooltip.addEventListener('mousedown',event=>event.preventDefault());
  tooltip.onclick=()=>{if(state.selection)open(state.selection);hideTooltip();window.getSelection()?.removeAllRanges()};
  $('chatMessages').addEventListener('mouseup',()=>setTimeout(showTooltip,25));
  $('exploreMessages').addEventListener('mouseup',()=>setTimeout(showTooltip,25));
  $('exploreMessages').addEventListener('touchend',()=>setTimeout(showTooltip,260),{passive:true});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#exploreTooltip,.chat-message-text,#exploreMessages p'))hideTooltip()});
  function anchorFor(branch){
    if(!branch)return null;
    return document.querySelector('[data-anchor="'+branch.id+'"]');
  }
  function open(anchor){
    const thread=threadById(anchor.threadId);if(!thread)return;
    if(thread.id!==current().id)chat().openThread(thread.id);
    thread.explorations=thread.explorations||[];
    const wantParent=anchor.parentBranchId??null;
    let branch=thread.explorations.find(item=>(item.parentId??null)===wantParent&&item.messageId===anchor.messageId&&item.start===anchor.start&&item.end===anchor.end);
    if(!branch){
      const parentBranch=wantParent?thread.explorations.find(item=>item.id===wantParent):null;
      const sourceText=parentBranch?(parentBranch.messages||[]).find(item=>item.id===anchor.messageId):thread.messages.find(item=>item.id===anchor.messageId);
      const raw=sourceText?.content||'';
      const context=raw.slice(Math.max(0,anchor.start-150),Math.min(raw.length,anchor.end+150))||'';
      branch={id:uid(),threadId:thread.id,parentId:wantParent||null,messageId:anchor.messageId,start:anchor.start,end:anchor.end,
        quote:anchor.quote,context,
        /* 创建子探索时的背景快照：目标（上一层的问题）、选文与附近上下文 */
        background:parentBranch?{origin:(parentBranch.messages||[]).find(item=>item.role==='user')?.content?.slice(0,300)||'',quote:anchor.quote,context}:null,
        scrollTop:anchor.scrollTop||0,panelScroll:0,draft:null,
        status:'open',promoted:false,sessionId:null,messages:[],createdAt:new Date().toISOString()};
      thread.explorations.push(branch);chat().save();
    }
    persistViewState();
    state.branchId=branch.id;state.error='';
    $('app').classList.add('explore-open');$('app').classList.remove('thread-visible');
    renderStack();chat().refresh();
    requestAnimationFrame(()=>{anchorFor(branch)?.scrollIntoView({block:'nearest'});requestAnimationFrame(()=>{drawStrand(true);setTimeout(()=>{if(active()?.id===branch.id){$('app').classList.add('thread-visible');drawStrand();$('exploreInput').focus()}},matchMedia('(prefers-reduced-motion: reduce)').matches?0:160)})});
    if(thread.mode==='demo'&&!branch.messages.length)setTimeout(()=>{if(active()?.id===branch.id)sendBranch()},280);
  }
  function messageRows(branch){
    return (branch.messages||[]).map(message=>'<div class="explore-message '+esc(message.role)+'" data-mid="'+esc(message.id)+'"><span>'+(message.role==='user'?'你':'Weave')+'</span><p>'+esc(message.content)+'</p></div>').join('');
  }
  /* 在某个面板里为该层的子探索标注原句锚点 */
  function decorateBranchMessages(container,branch){
    const kids=childrenOf(branch.id);if(!kids.length)return;
    const byMessage=new Map();
    for(const kid of kids){const list=byMessage.get(kid.messageId)||[];list.push(kid);byMessage.set(kid.messageId,list)}
    for(const [messageId,list] of byMessage){
      const p=container.querySelector('.explore-message[data-mid="'+messageId+'"] p');
      const message=(branch.messages||[]).find(item=>item.id===messageId);if(!p||!message)continue;
      const raw=message.content||'';
      const fragment=document.createDocumentFragment();let cursor=0;
      for(const kid of list.sort((a,b)=>a.start-b.start)){
        let start=kid.start,end=kid.end;
        if(raw.slice(start,end)!==kid.quote){start=raw.indexOf(kid.quote,cursor);end=start+kid.quote.length}
        if(start<cursor||start<0)continue;
        fragment.append(document.createTextNode(raw.slice(cursor,start)));
        const marker=document.createElement('span');marker.className='anchored-phrase '+(kid.status==='resolved'?'resolved':'open')+(kid.promoted?' promoted':'');
        marker.dataset.anchor=kid.id;marker.tabIndex=0;marker.setAttribute('role','button');marker.setAttribute('aria-label','继续探索：'+kid.quote);
        if(kid.id===state.branchId&&$('app').classList.contains('explore-open'))marker.classList.add('active-anchor');
        marker.textContent=raw.slice(start,end);marker.title=kid.status==='resolved'?'已探索 · 点击继续':'侧边探索 · 点击打开';
        fragment.append(marker);cursor=end;
      }
      fragment.append(document.createTextNode(raw.slice(cursor)));p.replaceChildren(fragment);
    }
  }
  function renderBranchInto(container,branch,{quoteLabel}){
    container.querySelector('.explore-source blockquote').textContent='“'+branch.quote+'”';
    const list=container.querySelector('.explore-messages');
    list.innerHTML=messageRows(branch);
    decorateBranchMessages(container,branch);
  }
  function renderStack(){
    const branch=active();
    if(!branch){$('app').classList.remove('explore-open','thread-visible','explore-deep');drawStrand();return}
    const chain=chainOf(branch.id),parent=chain[1]||null,app=$('app');
    app.classList.toggle('explore-deep',!!parent);
    /* 路径导航：主对话 › … › 上一层 › 当前 */
    const pathEl=$('explorePath');
    pathEl.hidden=chain.length<2;
    const crumbs=[{label:WeaveI18n.t('主对话'),goto:''}].concat([...chain].reverse().map(item=>({label:item.quote.length>16?item.quote.slice(0,15)+'…':item.quote,goto:item.id})));
    pathEl.innerHTML=crumbs.map((crumb,i)=>'<button data-goto="'+esc(crumb.goto)+'"'+(i===crumbs.length-1?' class="now"':'')+'>'+esc(crumb.label)+'</button>').join('<span class="path-sep">›</span>');
    renderBranchInto(panel,branch,{});
    $('exploreQuote').textContent='“'+branch.quote+'”';
    $('exploreContext').textContent=branch.context||'';
    if(parent){
      renderBranchInto(parentPanel,parent,{});
      parentPanel.classList.add('show');
      parentPanel.classList.toggle('current',false);
    }else parentPanel.classList.remove('show');
    $('exploreInput').value=branch.draft??prefill(branch);
    $('exploreInput').placeholder=WeaveI18n.t('继续追问…');
    $('exploreMode').textContent=state.error;$('exploreMode').classList.toggle('error',!!state.error);
    const answered=(branch.messages||[]).some(message=>message.role==='assistant');
    $('explorePromote').textContent=branch.promoted?WeaveI18n.t('已保留'):WeaveI18n.t('保留想法 ↗');
    $('explorePromote').disabled=branch.promoted||!answered;
    $('exploreReturn').textContent=parent?WeaveI18n.t('返回上一层 ↶'):WeaveI18n.t('返回原文 ↶');
    $('exploreReturn').disabled=!answered||state.busy;
    $('exploreSend').disabled=state.busy;
    markActiveAnchors();
    requestAnimationFrame(()=>{$('exploreScroll').scrollTop=branch.panelScroll||0});
    drawStrand();
  }
  function markActiveAnchors(){
    document.querySelectorAll('.active-anchor').forEach(el=>el.classList.remove('active-anchor'));
    if(!$('app').classList.contains('explore-open'))return;
    const branch=active();if(!branch)return;
    const anchor=anchorFor(branch);
    if(anchor&&anchor.closest('#explorePanel,#parentPanel,#chatMessages'))anchor.classList.add('active-anchor');
  }
  function gotoBranch(id){
    const branch=branchById(id);
    if(!branch||branch.id===state.branchId)return;
    open(fromBranch(branch));
  }
  function gotoMain(){
    const branch=active();if(!branch){close();return}
    const top=topLevelOf(branch);
    persistViewState();close();chat().refresh();
    requestAnimationFrame(()=>goToAnchor(top.id,true));
  }
  function drawStrand(animate=false){
    const branch=active();
    if(!branch||!$('app').classList.contains('explore-open')||!$('app').classList.contains('thread-visible')){strand.style.display='none';strand.innerHTML='';return}
    const chain=chainOf(branch.id),parent=chain[1]||null;
    const links=[];
    const currentAnchor=anchorFor(branch);
    if(currentAnchor)links.push({anchor:currentAnchor,target:panel});
    if(parent&&parentPanel.classList.contains('show')){
      const parentAnchor=(()=>{const el=anchorFor(parent);return el&&el.closest('#chatMessages')?el:null})();
      if(parentAnchor)links.push({anchor:parentAnchor,target:parentPanel});
    }
    if(!links.length){strand.style.display='none';strand.innerHTML='';return}
    strand.style.display='block';
    strand.innerHTML=links.map(()=>'<path></path><circle r="3"></circle>').join('');
    const paths=[...strand.querySelectorAll('path')],dots=[...strand.querySelectorAll('circle')];
    links.forEach((link,i)=>{
      const boxes=link.anchor.getClientRects(),r=boxes[boxes.length-1];if(!r)return;
      const end=link.target.getBoundingClientRect();
      const x=Math.min(r.right+8,end.left-20),y=r.top+r.height/2,ex=end.left+1,ey=end.top+85;
      paths[i].setAttribute('d','M '+x+' '+y+' C '+(x+(ex-x)*.6)+' '+y+', '+(ex-45)+' '+ey+', '+ex+' '+ey);
      dots[i].setAttribute('cx',x);dots[i].setAttribute('cy',y);
      if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
        const len=paths[i].getTotalLength();
        paths[i].animate([{strokeDasharray:len,strokeDashoffset:len,opacity:.3},{strokeDasharray:len,strokeDashoffset:0,opacity:1}],{duration:380,easing:'cubic-bezier(.2,.8,.2,1)'});
      }
    });
  }
  function goToAnchor(branchId,showCue=false){
    let branch=branches().find(item=>item.id===branchId);
    if(branch?.parentId)branch=topLevelOf(branch);
    if(!branch)return;
    const anchor=anchorFor(branch);if(!anchor)return;
    $('chatScroll').scrollTop=branch.scrollTop;
    const ar=anchor.getBoundingClientRect(),vr=$('chatScroll').getBoundingClientRect();if(ar.top<vr.top||ar.bottom>vr.bottom)anchor.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});anchor.classList.add('anchor-flash');anchor.focus({preventScroll:true});
    setTimeout(()=>anchor.classList.remove('anchor-flash'),800);
    if(showCue){
      cue.classList.add('show');$('returnPromote').hidden=branch.promoted;
      clearTimeout(state.cueTimer);state.cueTimer=setTimeout(()=>cue.classList.remove('show'),9000);
    }
  }
  function close(){
    persistViewState();
    state.branchId=null;
    $('app').classList.remove('explore-open','thread-visible','explore-deep');
    parentPanel.classList.remove('show');
    strand.style.display='none';strand.innerHTML='';
    document.querySelectorAll('.active-anchor').forEach(el=>el.classList.remove('active-anchor'));
  }
  $('exploreClose').onclick=close;
  function returnUp(){
    const branch=active();if(!branch)return;
    persistViewState();
    const parent=branchById(branch.parentId);
    if(!parent){returnToSource();return}
    state.branchId=parent.id;
    renderStack();
    const anchor=anchorFor(branch);
    if(anchor){anchor.classList.add('anchor-flash');setTimeout(()=>anchor.classList.remove('anchor-flash'),800)}
    $('exploreInput').focus();
  }
  function returnToSource(){
    const branch=active();if(!branch)return;
    $('app').classList.remove('thread-visible');
    const first=strand.querySelector('path');
    if(first&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      const len=first.getTotalLength();
      first.animate([{strokeDasharray:len,strokeDashoffset:0,opacity:1},{strokeDasharray:len,strokeDashoffset:len,opacity:0}],{duration:230,fill:'forwards'});
      return setTimeout(()=>{finishReturn(branch)},240);
    }
    finishReturn(branch);
  }
  function finishReturn(branch){
    strand.getAnimations().forEach(a=>a.cancel());
    branch.status='resolved';chat().save();close();chat().refresh();
    requestAnimationFrame(()=>goToAnchor(branch.id,true));
  }
  $('exploreReturn').onclick=()=>{active()?.parentId?returnUp():returnToSource()};
  $('parentBack').onclick=returnUp;
  $('explorePath').addEventListener('click',event=>{
    const button=event.target.closest('[data-goto]');if(!button)return;
    if(button.dataset.goto===''){gotoMain();return}
    if(button.classList.contains('now'))return;
    gotoBranch(button.dataset.goto);
  });
  for(const container of [panel,parentPanel]){
    container.addEventListener('click',event=>{
      const element=event.target.closest('[data-anchor]');if(!element)return;
      const branch=branchById(element.dataset.anchor);
      if(branch)gotoBranch(branch.id);
    });
  }
  $('chatMessages').addEventListener('click',event=>{
    const element=event.target.closest('[data-anchor]');if(!element)return;
    const branch=branchById(element.dataset.anchor);
    if(branch)gotoBranch(branch.id);
  });
  function demoAnswer(branch,question){
    if(WeaveI18n.language==='en')return WeaveI18n.branchAnswer(branch.quote);
    const word=branch.quote;
    if(/context contamination|上下文污染/i.test(word))return '“上下文污染”是指：前一个问题的背景被带进新的问题，让 AI 在不该继承的假设下回答。比如你在讨论法律合同，突然岔开问写作风格，模型仍把合同条款当成当前目标。\n\n侧边探索把这段追问隔离在独立支线；你理解后，可以直接回到原句继续读。';
    if(/如何|为什么|怎么|何时/.test(question))return '可以从三个角度理解「'+word+'」：它在这里指什么、为什么会影响当前问题、以及一个最小例子。\n\n就当前原文而言，它提醒我们先弄清这处概念，再继续沿着主线阅读。';
    return '这里的「'+word+'」指的是原回答中的一个局部想法。你可以在这个侧边空间继续问例子或反例；理解后，点击“返回原文”会精确定位到刚才选中的词句。';
  }
  async function sendBranch(event){
    event?.preventDefault();if(state.busy)return;
    const branch=active();if(!branch)return;
    const question=$('exploreInput').value.trim();if(!question)return;
    const thread=threadById(branch.threadId);if(!thread)return;
    state.error='';branch.status='open';
    branch.messages.push({id:msgId(),role:'user',content:question,at:new Date().toISOString()});
    branch.draft='';$('exploreInput').value='';state.busy=true;chat().save();renderStack();
    try{
      let answer;
      if(thread.mode==='real'){
        let message=question;
        if(!branch.sessionId){
          /* 每条探索独立会话：首条消息只带本层背景快照，不带全部历史 */
          const background=branch.background?.origin?'上一层正在探索的问题：'+branch.background.origin+'\n':'';
          message='主对话原文片段：'+branch.context.slice(0,1300)+'\n用户选中的文字：'+branch.quote+'\n'+background+'请只在这条侧边支线里回答，不改变主对话的上下文。\n问题：'+question;
        }
        const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Weave-Client':'1'},body:JSON.stringify({message,model:thread.model||'sonnet',...(branch.sessionId?{sessionId:branch.sessionId}:{})})});
        const data=await response.json();if(!response.ok||data.status!=='completed')throw Error(data.error||'侧边对话没有收到回复');
        branch.sessionId=data.sessionId;answer=data.reply;
      }else answer=await new Promise(resolve=>setTimeout(()=>resolve(demoAnswer(branch,question)),620));
      branch.messages.push({id:msgId(),role:'assistant',content:String(answer),demo:thread.mode!=='real',at:new Date().toISOString()});chat().save();
    }catch(error){branch.messages.pop();$('exploreInput').value=question;state.error='发送失败：'+error.message}
    finally{state.busy=false;if(state.branchId===branch.id){renderStack();$('exploreInput').focus()}}
  }
  $('exploreForm').addEventListener('submit',sendBranch);
  $('exploreInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();sendBranch()}});
  $('exploreInput').addEventListener('input',()=>{const branch=active();if(branch)branch.draft=$('exploreInput').value});
  async function promote(){
    const branch=active()||branches().find(item=>item.id===state.branchId);if(!branch||branch.promoted)return;
    const last=[...branch.messages].reverse().find(item=>item.role==='assistant');if(!last)return;
    const thread=threadById(branch.threadId);thread.promotedIdeas=thread.promotedIdeas||[];
    const top=topLevelOf(branch);
    thread.promotedIdeas.push({id:uid(),explorationId:branch.id,messageId:top.messageId,start:top.start,end:top.end,
      title:branch.quote.length>35?branch.quote.slice(0,34)+'…':branch.quote,
      summary:last.content.slice(0,240),question:branch.messages.find(item=>item.role==='user')?.content||branch.quote});
    branch.promoted=true;branch.status='resolved';chat().save();renderStack();
    await window.WeaveStudio?.keepIdea(branch);close();chat().refresh();requestAnimationFrame(()=>goToAnchor(top.id));
  }
  $('explorePromote').onclick=promote;$('returnPromote').onclick=promote;
  function decorate(){
    const thread=current();if(!thread)return;
    const byMessage=new Map();
    for(const branch of thread.explorations||[]){if(branch.parentId)continue;const list=byMessage.get(branch.messageId)||[];list.push(branch);byMessage.set(branch.messageId,list)}
    for(const [messageId,list] of byMessage){
      const article=[...$('chatMessages').querySelectorAll('[data-message]')].find(item=>item.dataset.message===messageId);
      const text=article?.querySelector('.chat-message-text');if(!text)continue;
      const raw=thread.messages.find(item=>item.id===messageId)?.content||'';
      const fragment=document.createDocumentFragment();let cursor=0;
      for(const branch of list.sort((a,b)=>a.start-b.start)){
        let start=branch.start,end=branch.end;
        if(raw.slice(start,end)!==branch.quote){start=raw.indexOf(branch.quote,cursor);end=start+branch.quote.length}
        if(start<cursor||start<0)continue;
        fragment.append(document.createTextNode(raw.slice(cursor,start)));
        const marker=document.createElement('span');marker.className='anchored-phrase '+(branch.status==='resolved'?'resolved':'open')+(branch.promoted?' promoted':'');
        marker.dataset.anchor=branch.id;marker.tabIndex=0;marker.setAttribute('role','button');marker.setAttribute('aria-label','继续探索：'+branch.quote);if(branch.id===state.branchId&&$('app').classList.contains('explore-open'))marker.classList.add('active-anchor');marker.textContent=raw.slice(start,end);marker.title=branch.status==='resolved'?'已探索 · 点击继续':'侧边探索 · 点击打开';
        fragment.append(marker);cursor=end;
      }
      fragment.append(document.createTextNode(raw.slice(cursor)));text.replaceChildren(fragment);
    }
    markActiveAnchors();
  }
  function updateMapCover(){
    const root=window.WeaveApp.getRoot();mapCover.classList.toggle('show',!root?.sourceChatThreadId);
  }
  function updateInspector(){
    const node=window.WeaveApp.getSelected();if(!node)return;
    $('deleteIdea').disabled=node.id==='root';
    $('focusIdeaTitle').textContent=node.title;
    const nodes=WeaveApp.getNodes(),blocked=new Set([node.id]);let changed=true;while(changed){changed=false;for(const n of nodes)if(blocked.has(n.parent)&&!blocked.has(n.id)){blocked.add(n.id);changed=true}}
    $('ideaParent').innerHTML=nodes.filter(n=>!blocked.has(n.id)).map(n=>'<option value="'+esc(n.id)+'"'+(n.id===node.parent?' selected':'')+'>'+esc(n.title)+'</option>').join('');$('ideaParent').disabled=node.id==='root';
    $('focusIdeaSummary').textContent=node.summary||'这个想法来自一段对话。';
    const thread=threadById(node.sourceChatThreadId);
    const source=thread?.messages.find(message=>node.sourceIds?.includes(message.id));
    const branch=branchById(node.explorationId);
    const topBranch=branch?topLevelOf(branch):null;
    const anchorBranch=branch&&branch.parentId?topBranch:branch;
    const messageIndex=thread?.messages.indexOf(source);
    $('focusIdeaSource').textContent=source
      ?(anchorBranch?'“'+anchorBranch.quote+'”\n':'')+(WeaveI18n.language==='en'?'Message '+(messageIndex+1)+' · '+(source.role==='assistant'?'AI reply':'Your question'):'第 '+(messageIndex+1)+' 条消息 · '+(source.role==='assistant'?'AI 回答':'你的提问'))+'\n'+(anchorBranch?.context||source.content).slice(0,185)
      :'来源对话暂不可用';
    $('focusGoSource').disabled=!source;
    $('focusIdeaRelated').textContent=node.explorationId?'已保留的想法':node.kind==='QUESTION'?'待探索的问题':node.kind==='DECISION'?'已记录的决定':'来自对话 · 可继续探索';
    $('focusIdeaExplore').disabled=!source;
  }
  document.addEventListener('weave:view-changed',event=>{if(event.detail.view==='map')updateMapCover();else{close();cue.classList.remove('show')}});
  document.addEventListener('weave:map-replaced',()=>{updateMapCover();updateInspector()});
  document.addEventListener('weave:node-selected',updateInspector);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){hideTooltip();if(state.branchId)close()}});
  /* 兼容旧数据：补 parentId 与支线消息稳定 ID，不清空任何记录 */
  function normalizeThreads(){
    let dirty=false;
    for(const thread of chat().getThreads()){
      for(const branch of thread.explorations||[]){
        if(branch.parentId===undefined){branch.parentId=null;dirty=true}
        if(branch.draft===undefined){branch.draft=null;dirty=true}
        for(const message of branch.messages||[])if(!message.id){message.id=msgId();dirty=true}
      }
    }
    if(dirty)chat().save();
  }
  window.WeaveFocus={decorate,goToAnchor,openFromMessage:open,dismiss:close,returnUp,
    reopenBranch:gotoBranch,
    /* 引导演示用：从某层探索的回答里选中文字，打开子探索 */
    openChildFromBranch(branchId,text){
      const branch=branchById(branchId);if(!branch)return false;
      const reply=[...(branch.messages||[])].reverse().find(item=>item.role==='assistant');if(!reply)return false;
      const start=reply.content.indexOf(text);if(start<0)return false;
      open({threadId:branch.threadId,parentBranchId:branch.id,messageId:reply.id,start,end:start+text.length,quote:text,panelScroll:0,scrollTop:$('chatScroll').scrollTop});
      return true;
    }};
  $('chatMessages').addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-anchor]')){event.preventDefault();event.target.click()}});
  document.addEventListener('weave:language-changed',()=>{updateInspector();if(active())renderStack()});
  normalizeThreads();decorate();updateMapCover();updateInspector();
})();
