/* Native conversation first; structure the conversation only when the user asks. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = 'weave-chat-workspace';
  const app = $('app');
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const short = (value,limit=36) => String(value || '').replace(/\s+/g,' ').trim().slice(0,limit);
  const id = () => 'c-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  const now = () => new Date().toISOString();
  const firstSample = () => ({
    id:id(), title:WeaveI18n.t('长对话如何长出新想法'), language:WeaveI18n.language, mode:'demo', model:'sonnet', sessionId:null,
    createdAt:now(), demo:true,
    messages:window.WeaveImport.sampleMessages().map(message => ({...message, at:now(), sample:true, pinned:false}))
  });
  function load(){
    try{
      const data=JSON.parse(localStorage.getItem(KEY));
      if(data && Array.isArray(data.threads) && data.threads.length){
        const threads=data.threads.filter(thread=>thread && typeof thread.id==='string' && Array.isArray(thread.messages));
        if(threads.length){
          let activeId=threads.some(thread=>thread.id===data.activeId)?data.activeId:threads[0].id;
          if(!localStorage.getItem('weave-studio-intro')){
            const draft=threads.find(thread=>!thread.messages.length)||{id:id(),title:WeaveI18n.t('新对话'),mode:'demo',model:'sonnet',sessionId:null,createdAt:now(),messages:[]};
            if(!threads.includes(draft))threads.unshift(draft);
            activeId=draft.id;localStorage.setItem('weave-studio-intro','1');
          }
          return {threads,activeId};
        }
      }
    }catch(_){ }
    const sample=firstSample();
    const draft={id:id(),title:WeaveI18n.t('新对话'),mode:'demo',model:'sonnet',sessionId:null,createdAt:now(),messages:[]};
    try{localStorage.setItem('weave-studio-intro','1')}catch(_){}
    return {threads:[draft,sample],activeId:sample.id};
  }
  const state={...load(),view:'chat',bridgeAvailable:false,busy:false,converting:null,conversionBusy:false,persistError:false};
  const current=()=>state.threads.find(thread=>thread.id===state.activeId)||state.threads[0];
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({threads:state.threads,activeId:state.activeId}));state.persistError=false}
    catch(_){state.persistError=true;$('chatBottomNote').textContent='浏览器本地存储已满；请复制需要保留的对话内容。'}
  }
  function notify(message){
    const box=$('toast');box.textContent=message;box.classList.add('show');
    clearTimeout(notify.timer);notify.timer=setTimeout(()=>box.classList.remove('show'),3000);
  }
  function timeLabel(value){
    const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleTimeString(WeaveI18n.language==='en'?'en-US':'zh-CN',{hour:'2-digit',minute:'2-digit'});
  }
  function renderThreads(){
    $('chatThreadList').innerHTML=state.threads.filter(thread=>thread.messages.length).map(thread=>{
      const active=thread.id===state.activeId?' active':'';
      const count=thread.messages.length;
      return '<button class="chat-thread'+active+'" data-thread="'+escapeHtml(thread.id)+'" title="双击可重命名"><span class="thread-mark">'+(thread.demo?'◇':'☰')+'</span><span class="thread-name">'+escapeHtml(thread.title||'新对话')+'</span><span class="thread-count">'+count+'</span></button>';
    }).join('')||'<div class="chat-thread-empty">点击“新对话”，从一个问题开始。</div>';
  }
  function welcome(){
    if(WeaveI18n.language==='en')return '<div class="chat-welcome"><div class="chat-welcome-icon">◇</div><h2>One question. Many possible directions.</h2><p>Talk it through. Follow a tangent. Keep the discoveries that matter.</p><div class="chat-prompts"><button data-prompt="I want to design a product that helps heavy AI users keep track of ideas in long conversations. Help me define the core scenario.">Explore a product idea →</button><button data-prompt="Help me think through a complex problem: identify the main question, the unknowns, and the side questions worth exploring.">Start with a complex question →</button></div></div>';
    return '<div class="chat-welcome"><div class="chat-welcome-icon">◇</div><h2>一个问题，可以长出很多方向。</h2><p>像普通 AI 聊天一样持续提问；侧问题先自然出现。之后再将这段对话整理成可编辑的 Idea Map。</p><div class="chat-prompts"><button data-prompt="我想设计一个帮助重度 AI 用户管理长对话中分支想法的产品。先帮我梳理核心场景。">梳理一个产品想法 →</button><button data-prompt="我正在探索一个复杂问题，请先和我一起明确主线、未知点与可能的侧问题。">从复杂问题开始 →</button></div></div>';
  }
  function renderMessages(scrollToEnd=false){
    const thread=current();
    const messages=thread.messages;
    app.classList.toggle('home-mode',messages.length===0);
    $('chatMessages').innerHTML=messages.length?messages.map(message=>{
      const role=message.role==='user'?'user':'assistant';
      const who=role==='user'?'你':'Weave';
      return '<article class="chat-message '+role+'" data-message="'+escapeHtml(message.id)+'">'
        +'<div class="chat-avatar">✦</div><div class="chat-message-body">'
        +'<div class="chat-message-meta"><strong>'+escapeHtml(who)+'</strong><span>'+escapeHtml(timeLabel(message.at))+'</span></div>'
        +'<div class="chat-message-text">'+escapeHtml(message.content)+'</div>'
        +'<div class="chat-message-tools"><button type="button" data-pin="'+escapeHtml(message.id)+'" class="'+(message.pinned?'pinned':'')+'">'+(message.pinned?'✦ 已标记想法':'◇ 标记想法')+'</button><button type="button" data-copy="'+escapeHtml(message.id)+'">复制</button></div>'
        +'</div></article>';
    }).join(''):welcome();
    window.WeaveFocus?.decorate();
    document.dispatchEvent(new CustomEvent('weave:chat-rendered'));
    if(state.busy){$('chatMessages').insertAdjacentHTML('beforeend','<article class="chat-message assistant" id="chatTyping"><div class="chat-avatar">✦</div><div class="chat-message-body"><div class="chat-message-meta"><strong>织思 · '+(thread.mode==='real'?'Claude':'演示')+'</strong></div><div class="chat-typing"><i></i><i></i><i></i><span style="margin-left:6px">正在回应</span></div></div></article>')}
    $('chatTopicTitle').textContent=thread.title||'长对话，从一个问题开始';
    $('chatTurnCount').textContent=messages.length+' 条消息';
    $('convertChatButton').disabled=!messages.length || state.busy;
    $('chatModelSelect').value=thread.model||'sonnet';
    $('chatModeSelect').value=thread.mode==='real' && state.bridgeAvailable?'real':'demo';
    $('chatSend').disabled=state.busy;
    $('chatInput').disabled=state.busy;
    if(!state.persistError){
      $('chatBottomNote').textContent=thread.mode==='real'
        ? state.bridgeAvailable?'Claude Code · 对话保存在当前浏览器':'本地 Claude Code 未连接；切换至演示聊天或启动 node server.mjs。'
        : '演示模式 · 回复为交互示例 · 对话保存在当前浏览器';
    }
    if(scrollToEnd)requestAnimationFrame(()=>{$('chatScroll').scrollTop=$('chatScroll').scrollHeight});
  }
  function render(scrollToEnd=false){renderThreads();renderMessages(scrollToEnd)}
  function makeThread(){
    if(state.busy){notify('这条回复完成后就可以开始新对话');return}
    const draft=state.threads.find(thread=>!thread.messages.length);
    if(draft){state.activeId=draft.id;save();render();$('chatInput').value='';$('chatInput').focus();return}
    const thread={id:id(),title:WeaveI18n.t('新对话'),mode:state.bridgeAvailable?'real':'demo',model:'sonnet',sessionId:null,createdAt:now(),messages:[]};
    state.threads.unshift(thread);state.activeId=thread.id;
    save();render();$('chatInput').value='';$('chatInput').focus();notify('已创建新对话');
  }
  function openThread(threadId){
    if(!state.threads.some(thread=>thread.id===threadId))return;
    state.activeId=threadId;save();render(true);setView('chat');
  }
  function setView(view,nav){
    state.view=view==='map'?'map':'chat';
    app.classList.toggle('chat-mode',state.view==='chat');
    document.querySelectorAll('.view-button').forEach(button=>button.classList.toggle('active',button.dataset.view===state.view));
    document.querySelectorAll('.nav-button').forEach(button=>button.classList.toggle('active',button.dataset.nav===(nav||state.view)));
    $('newExploration').textContent=state.view==='chat'?'＋ 新对话':'＋ 新分支';
    document.querySelector('.topbar-left strong').textContent=state.view==='chat'?(current().messages.length?'对话':'新对话'):'想法图谱';
    if(state.view==='map')requestAnimationFrame(()=>{
      const selected=window.WeaveApp.getSelected();
      if(selected?.id==='root'&&window.WeaveApp.getNodeCount()<=12)window.WeaveApp.fitMap();
      else window.WeaveApp.focusNode(selected?.id||'root');
    });
    document.dispatchEvent(new CustomEvent('weave:view-changed',{detail:{view:state.view}}));
  }
  function demoReply(question){
    if(WeaveI18n.language==='en')return WeaveI18n.demoReply(question);
    const q=question.replace(/\s+/g,' ').trim();
    if(/验收|checkpoint|任务|执行|agent|cli/i.test(q))return '可以把这个问题单独作为一个任务分支。先写清目标与 Prompt，再记录运行状态、过程输出和 checkpoint；最后由你查看结果并决定是否验收。';
    if(/分支|侧问题|发散|岔开/i.test(q))return '这个侧问题值得保留它的来处。继续聊完后，点“看见结构”，你可以在候选结构里把它挂到主线或上一个想法之下，并保留原消息入口。';
    if(/为什么|问题|痛点|困难/i.test(q))return '我会先把它当作一个待探索的问题：发生在什么场景？现有聊天工具在哪里让你失去主线？我们可以继续追问，再决定它在图谱里是主分支还是支线。';
    return '我们可以沿着「'+short(q,27)+'」继续拆解：先澄清目标，再列出两个可能方向，最后保留尚未解决的疑问。你可以继续追问，也可以稍后把这段对话整理成想法图谱。';
  }
  async function realReply(thread,userMessage){
    let prompt=userMessage.content;
    if(!thread.sessionId && thread.messages.length>1){
      const context=thread.messages.slice(0,-1).slice(-10).map(message=>(message.role==='user'?'用户':'助手')+'：'+message.content).join('\n');
      const intro='以下是本网站此前对话的节选。请把它作为上下文，继续回应最后的问题。\n';
      const tail='\n\n当前用户：';
      const available=Math.max(0,7800-intro.length-tail.length-prompt.length);
      prompt=intro+context.slice(-Math.min(3500,available))+tail+prompt;
    }
    const response=await fetch('/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json','X-Weave-Client':'1'},
      body:JSON.stringify({message:prompt,model:thread.model||'sonnet',...(thread.sessionId?{sessionId:thread.sessionId}:{})})
    });
    const data=await response.json().catch(()=>({error:'本地服务没有返回 JSON'}));
    if(!response.ok || data.status!=='completed'){
      const error=new Error(data.error||'Claude Code 没有返回回复');error.status=response.status;throw error;
    }
    if(typeof data.reply!=='string'||!data.reply.trim())throw new Error('Claude Code 返回了空回复');
    thread.sessionId=data.sessionId||null;
    return data.reply.trim();
  }
  async function send(event){
    if(event)event.preventDefault();
    if(state.busy)return;
    const content=$('chatInput').value.trim();
    if(!content)return;
    if(content.length>6000){notify('单条消息请控制在 6000 字以内');return}
    const thread=current();
    if(thread.mode==='real'&&!state.bridgeAvailable){notify('先启动本地服务，或切换为演示聊天');return}
    const message={id:id(),role:'user',content,at:now(),pinned:false};
    thread.messages.push(message);
    if(thread.title==='新对话'||thread.title==='New conversation')thread.title=short(content,28)||'新对话';
    $('chatInput').value='';state.busy=true;save();render(true);
    try{
      const reply=thread.mode==='real'?await realReply(thread,message):await new Promise(resolve=>setTimeout(()=>resolve(demoReply(content)),650));
      thread.messages.push({id:id(),role:'assistant',content:reply,at:now(),sample:false,sourceMode:thread.mode,pinned:false});
      save();
    }catch(error){
      thread.messages=thread.messages.filter(item=>item.id!==message.id);
      $('chatInput').value=content;
      if(error.status===404)thread.sessionId=null;
      notify(error.status===404?'会话已失效；消息已保留在输入框，请重试。':'发送失败：'+error.message);
      save();
    }finally{state.busy=false;render(true);$('chatInput').focus()}
  }
  async function health(){
    if(location.protocol==='file:')return;
    try{
      const response=await fetch('/api/health',{cache:'no-store'});
      const data=await response.json();
      state.bridgeAvailable=!!(response.ok&&data.ok&&data.provider?.available);
    }catch(_){state.bridgeAvailable=false}
    const option=$('chatModeSelect').querySelector('option[value="real"]');
    option.disabled=!state.bridgeAvailable;
    option.textContent=state.bridgeAvailable?'本地 Claude Code（真实）':'本地 Claude Code（未连接）';
    renderMessages();
  }
  function openConvert(){
    const thread=current();
    if(!thread.messages.length){notify('先聊几轮，再整理想法');return}
    state.converting={threadId:thread.id,...window.WeaveImport.structure(thread.messages,{rootTitle:thread.title})};
    for(const idea of thread.promotedIdeas||[]){
      if(state.converting.nodes.some(node=>node.explorationId===idea.explorationId))continue;
      const source=state.converting.nodes.find(node=>node.sourceIds?.includes(idea.messageId));
      state.converting.nodes.push({
        id:'promoted-'+idea.id,parent:source?.id||'idea-root',title:idea.title,
        kind:'INSIGHT',summary:idea.summary,prompt:idea.question,
        sourceIds:[idea.messageId],sourceIndexes:[],responsePreview:idea.summary,
        reason:'从侧边探索保留的想法',included:true,explorationId:idea.explorationId
      });
    }
    state.converting.stats.candidates=state.converting.nodes.length;
    $('convertTurnBadge').textContent=thread.messages.length+' 条消息';
    $('convertMethod').textContent='基于可见文本提示生成 · 可人工修改';
    $('convertWarning').textContent='候选结构只是初稿：侧问题与追问关系由显式文字线索识别。'+(state.converting.warnings.length?' '+state.converting.warnings.join(' '):'');
    $('aiRefineButton').disabled=!state.bridgeAvailable;
    renderCandidates();$('convertDialog').classList.add('show');
  }
  function candidateById(candidateId){return state.converting?.nodes.find(node=>node.id===candidateId)}
  function renderCandidates(){
    const nodes=state.converting?.nodes||[];
    $('convertStats').textContent=nodes.length+' 个候选节点 · '+nodes.filter(node=>node.included).length+' 个待采纳';
    const thread=state.threads.find(item=>item.id===state.converting?.threadId);
    $('candidateList').innerHTML=nodes.map((node,index)=>{
      const source=(thread?.messages||[]).find(message=>node.sourceIds?.includes(message.id));
      const earlier=nodes.slice(0,index);
      const parentOptions=index===0?'<option value="">主话题</option>':'<option value="idea-root">主话题</option>'+earlier.filter(item=>item.id!=='idea-root').map(item=>'<option value="'+escapeHtml(item.id)+'"'+(node.parent===item.id?' selected':'')+'>'+escapeHtml(short(item.title,23))+'</option>').join('');
      return '<div class="candidate'+(index===0?' root':'')+'" data-candidate="'+escapeHtml(node.id)+'">'
        +'<input type="checkbox" data-include="'+escapeHtml(node.id)+'" '+(node.included?'checked':'')+(index===0?' disabled':'')+' aria-label="采纳'+escapeHtml(node.title)+'"/>'
        +'<div class="candidate-main"><div class="candidate-tag">'+escapeHtml(node.kind||'IDEA')+' <span>· '+escapeHtml(node.reason||'来源于聊天')+'</span></div><input class="candidate-title" data-title="'+escapeHtml(node.id)+'" maxlength="70" value="'+escapeHtml(node.title)+'" aria-label="候选标题"/><p class="candidate-summary">'+escapeHtml(node.summary||'')+'</p><div class="candidate-source">来源：'+escapeHtml(source?(source.role==='user'?'你：':'AI：')+short(source.content,95):'当前对话')+'</div></div>'
        +'<div class="candidate-parent-wrap">上级想法<select class="candidate-parent" data-parent="'+escapeHtml(node.id)+'" '+(index===0?'disabled':'')+'>'+parentOptions+'</select></div>'
        +'</div>';
    }).join('');
  }
  function closeConvert(){if(state.conversionBusy)return;$('convertDialog').classList.remove('show')}
  function applyConvert(){
    if(!state.converting)return;
    for(const node of state.converting.nodes){
      const row=[...$('candidateList').querySelectorAll('.candidate')].find(item=>item.dataset.candidate===node.id);
      if(!row)continue;
      node.title=row.querySelector('[data-title]').value.trim()||node.title;
      node.included=node.id==='idea-root'||row.querySelector('[data-include]').checked;
      if(node.id!=='idea-root')node.parent=row.querySelector('[data-parent]').value||'idea-root';
    }
    try{
      const count=window.WeaveApp.replaceGraphFromIdeas(state.converting.nodes,state.converting.threadId);
      $('convertDialog').classList.remove('show');setView('map');
      notify('已从当前对话生成 '+count+' 个可管理的想法节点');
    }catch(error){notify(error.message)}
  }
  async function refineWithClaude(){
    if(!state.bridgeAvailable||!state.converting||state.conversionBusy)return;
    const snapshot=state.converting;
    const thread=state.threads.find(item=>item.id===snapshot.threadId);
    if(!thread)return;
    const transcript=thread.messages.slice(-22).map(message=>message.id+' '+message.role+': '+message.content).join('\n').slice(-4200);
    const draft=snapshot.nodes.map(node=>({id:node.id,parent:node.parent,title:node.title,kind:node.kind}));
    const prompt='请根据以下中文对话与候选思维图，仅优化现有候选节点的 title、kind、summary 和 parent。不得增删或重命名 id；parent 只能引用已有且顺序更早的节点 id，或 idea-root。只输出 JSON 对象 {"nodes":[{"id":"...","parent":"...","title":"...","kind":"...","summary":"..."}]}，不要 Markdown。\n候选：'+JSON.stringify(draft)+'\n对话：'+transcript;
    if(prompt.length>7900){notify('当前对话太长，先用基础结构整理；Claude 精整最多处理最近 22 条消息。');return}
    state.conversionBusy=true;$('aiRefineButton').disabled=true;$('aiRefineButton').textContent='Claude 正在精整…';
    try{
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Weave-Client':'1'},body:JSON.stringify({message:prompt,model:'sonnet'})});
      const data=await response.json();
      if(!response.ok||data.status!=='completed')throw new Error(data.error||'模型未返回结构');
      let raw=String(data.reply||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
      const parsed=JSON.parse(raw);if(!Array.isArray(parsed.nodes))throw new Error('模型输出不是候选节点数组');
      const index=new Map(snapshot.nodes.map((node,i)=>[node.id,i]));
      for(const proposal of parsed.nodes){
        const i=index.get(proposal.id);if(i==null)continue;
        const node=snapshot.nodes[i];
        if(typeof proposal.title==='string'&&proposal.title.trim())node.title=proposal.title.trim().slice(0,70);
        if(typeof proposal.summary==='string')node.summary=proposal.summary.trim().slice(0,280);
        if(typeof proposal.kind==='string')node.kind=proposal.kind.trim().slice(0,25);
        if(i>0 && index.has(proposal.parent) && index.get(proposal.parent)<i)node.parent=proposal.parent;
      }
      $('convertMethod').textContent='Claude 辅助精整 · 请人工检查';
      $('convertWarning').textContent='模型已修改候选标题与关系；来源消息保留。请逐条确认后再生成图谱。';
      renderCandidates();notify('Claude 已给出结构建议，请检查后采纳');
    }catch(error){notify('精整失败：'+error.message)}
    finally{state.conversionBusy=false;$('aiRefineButton').disabled=!state.bridgeAvailable;$('aiRefineButton').textContent='✦ Claude 辅助精整'}
  }
  function returnToSource(){
    const node=window.WeaveApp.getSelected();
    if(!node?.sourceChatThreadId)return;
    const thread=state.threads.find(item=>item.id===node.sourceChatThreadId);
    if(!thread){notify('原对话在此浏览器中已不可用');return}
    openThread(thread.id);setView('chat');
    if(node.explorationId){requestAnimationFrame(()=>window.WeaveFocus?.goToAnchor(node.explorationId));return}
    const sourceId=node.sourceIds?.[0];
    if(sourceId)requestAnimationFrame(()=>{
      const element=[...$('chatMessages').querySelectorAll('[data-message]')].find(item=>item.dataset.message===sourceId);
      if(element){element.scrollIntoView({block:'center',behavior:'smooth'});element.classList.add('source-highlight');setTimeout(()=>element.classList.remove('source-highlight'),2200)}
    });
  }
  function ensureSourceButton(){
    const heading=document.querySelector('.inspector-heading');
    if(!heading)return;
    let button=$('backToSource');
    if(!button){button=document.createElement('button');button.id='backToSource';button.className='back-to-source';button.textContent='↶ 回到来源对话';button.onclick=returnToSource;heading.appendChild(button)}
    button.hidden=!window.WeaveApp.getSelected()?.sourceChatThreadId;
  }
  function bind(){
    $('chatComposer').addEventListener('submit',send);
    $('chatInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();send()}});
    $('chatThreadList').addEventListener('click',event=>{const button=event.target.closest('[data-thread]');if(button)openThread(button.dataset.thread)});
    $('chatThreadList').addEventListener('dblclick',event=>{
      const button=event.target.closest('[data-thread]');if(!button)return;
      const thread=state.threads.find(item=>item.id===button.dataset.thread);if(!thread)return;
      const input=document.createElement('input');input.value=thread.title;input.maxLength=48;input.className='thread-rename';
      button.replaceWith(input);input.focus();input.select();
      const finish=()=>{thread.title=input.value.trim()||thread.title;save();renderThreads()};
      input.addEventListener('blur',finish,{once:true});input.addEventListener('keydown',key=>{if(key.key==='Enter')input.blur();if(key.key==='Escape'){input.value=thread.title;input.blur()}});
    });
    $('chatMessages').addEventListener('click',async event=>{
      const prompt=event.target.closest('[data-prompt]');if(prompt){$('chatInput').value=prompt.dataset.prompt;$('chatInput').focus();return}
      const pin=event.target.closest('[data-pin]');if(pin){const message=current().messages.find(item=>item.id===pin.dataset.pin);if(message){message.pinned=!message.pinned;save();renderMessages()}return}
      const copy=event.target.closest('[data-copy]');if(copy){const message=current().messages.find(item=>item.id===copy.dataset.copy);if(message){try{await navigator.clipboard.writeText(message.content);notify('已复制消息')}catch(_){notify('当前浏览器无法复制')}}}
    });
    $('chatModelSelect').addEventListener('change',event=>{current().model=event.target.value;save()});
    $('chatModeSelect').addEventListener('change',event=>{
      const thread=current();thread.mode=event.target.value;
      if(thread.mode==='real'&&!state.bridgeAvailable){thread.mode='demo';notify('先启动本地服务')}
      save();renderMessages();
    });
    $('newExploration').onclick=()=>state.view==='chat'?makeThread():window.WeaveApp.openRootBranch();
    document.querySelectorAll('.view-button').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
    document.querySelectorAll('.nav-button').forEach(button=>button.addEventListener('click',()=>{
      if(button.dataset.nav==='chat')setView('chat');
      else setView('map',button.dataset.nav);
    }));
    $('convertChatButton').onclick=openConvert;
    $('cancelConvert').onclick=closeConvert;$('closeConvert').onclick=closeConvert;
    $('convertDialog').addEventListener('click',event=>{if(event.target===$('convertDialog'))closeConvert()});
    $('applyConvert').onclick=applyConvert;$('aiRefineButton').onclick=refineWithClaude;
    $('candidateList').addEventListener('change',event=>{
      const checkbox=event.target.closest('[data-include]');
      if(checkbox){const node=candidateById(checkbox.dataset.include);if(node)node.included=checkbox.checked;$('convertStats').textContent=state.converting.nodes.length+' 个候选节点 · '+state.converting.nodes.filter(item=>item.included).length+' 个待采纳'}
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeConvert()});
    document.addEventListener('weave:node-selected',ensureSourceButton);
    document.addEventListener('weave:map-replaced',ensureSourceButton);
  }
  bind();render(true);setView('chat');ensureSourceButton();save();health();
  window.WeaveChat={setView,openThread,returnToSource,makeThread,getCurrent:current,getThreads:()=>state.threads,save,refresh:render,
    openGuideSample(){
      let thread=state.threads.find(t=>t.guideDemo&&(t.language||'zh')===WeaveI18n.language);
      if(!thread){thread=firstSample();thread.id=id();thread.title=WeaveI18n.t('Weave · 引导演示');thread.guideDemo=true;thread.demo=false;state.threads.push(thread)}
      openThread(thread.id);requestAnimationFrame(()=>$('chatScroll').scrollTop=0);return thread;
    },
    getCandidates(){
      const thread=current(),result=window.WeaveImport.structure(thread.messages,{rootTitle:thread.title});
      for(const idea of thread.promotedIdeas||[]){
        const source=result.nodes.find(node=>node.sourceIds?.includes(idea.messageId));
        result.nodes.push({id:'promoted-'+idea.id,parent:source?.id||'idea-root',title:idea.title,kind:'INSIGHT',summary:idea.summary,prompt:idea.question,sourceIds:[idea.messageId],sourceIndexes:[],reason:'由侧边探索保留',included:true,explorationId:idea.explorationId});
      }
      return result;
    },
    openSample(){
      let sample=state.threads.find(thread=>thread.demo&&(thread.language||'zh')===WeaveI18n.language);
      if(!sample){sample=firstSample();state.threads.push(sample)}
      openThread(sample.id);
    }
  };
})();
