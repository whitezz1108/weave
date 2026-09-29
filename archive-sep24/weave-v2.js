/* Weave V2: a local-first concept prototype. Real CLI work is opt-in. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = 'weave-v2-workspace';
  const STATUS = {
    queued: { zh: '待探索', en: 'QUEUED' },
    running: { zh: '运行中', en: 'RUNNING' },
    review: { zh: '待验收', en: 'REVIEW' },
    done: { zh: '已完成', en: 'DONE' },
    accepted: { zh: '已验收', en: 'ACCEPTED' },
    error: { zh: '运行失败', en: 'ERROR' },
    cancelled: { zh: '已停止', en: 'CANCELLED' }
  };
  const MODEL = { sonnet: 'Claude Sonnet', opus: 'Claude Opus', haiku: 'Claude Haiku' };
  const nodeById = id => state.nodes.find(n => n.id === id);
  const children = id => state.nodes.filter(n => n.parent === id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
  const shortTime = value => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value).slice(0,8) : d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  };
  function seedNodes() {
    const make = (id,parent,title,kind,status,progress,summary,prompt,collapsed=false) => ({
      id,parent,title,kind,status,progress,summary,prompt,collapsed,
      model:'sonnet',permission:'plan',mode:'demo',taskId:null,startedAt:null,finishedAt:null,
      exitCode:null,sessionId:null,resultIsError:false,logs:[],checkpoints:[],acceptance:null
    });
    const a = [
      make('root',null,'长时间发散探索','NORTH STAR','running',67,'把不断生长的 AI 对话变成可导航、可执行、可回溯的探索空间。','设计一个适合长期发散思考的 AI Client。用户可以从任一对话节点分支，随后交给外部 CLI 执行并验收。'),
      make('problem','root','问题空间','RESEARCH','done',100,'用户在长对话中失去主线，侧问题也难以保留来处。','分析重度 AI 用户在长对话里遭遇的失焦、回溯和上下文切换问题。',true),
      make('lost','problem','为什么对话会失焦？','INSIGHT','done',100,'线性消息流混合了目标、联想和临时问题。','梳理用户在一条聊天中不断偏离初始目标的原因。'),
      make('return-cost','problem','找回旧思路的成本','INSIGHT','done',100,'回到某个时刻需要大量滚动和重读。','分析长对话回溯的成本与典型行为。'),
      make('interaction','root','交互模型','DESIGN','running',72,'地图负责关系与导航，对话面板负责阅读与行动。','提出对话图谱与聊天窗并存的交互方案。'),
      make('map','interaction','图谱导航','CANVAS','done',100,'用空间关系保存分支的来处。','设计可拖动、缩放、定位的对话图谱。',true),
      make('spatial','map','多层级空间结构','CANVAS','done',100,'节点按父子关系生长，局部可以折叠。','规划 4 层以上的思维图布局。'),
      make('fold','map','折叠与展开','CANVAS','done',100,'让复杂图谱保持可读。','定义分支展开、折叠和隐藏数量提示。'),
      make('branch','interaction','从任意节点开支线','FLOW','running',58,'侧问题继承起点，但保留独立进展。','设计从任意节点开侧支、继续提问、返回主线的完整交互。'),
      make('context','branch','局部上下文继承','FLOW','running',45,'每个分支记住它从哪一个问题开始。','界定侧支需要继承的上文范围。'),
      make('resume','branch','返回主线','FLOW','queued',0,'沿路径回到原节点，不覆盖侧支。','设计用户在支线探索后回到主线的动作。'),
      make('retrieval','interaction','搜索与定位','TOOL','queued',0,'通过标题、模型状态与 checkpoint 找回内容。','设计图谱中的跨节点搜索与定位。'),
      make('execution','root','执行代理','ORCHESTRATION','running',62,'把图谱节点变成可分发、可监控、可验收的任务单元。','定义主指挥工作台如何向本地 CLI 分发任务。'),
      make('cli','execution','Claude Code 指挥与连接','CLI TASK','running',64,'从节点发送 Prompt，读取本机 CLI 的状态、输出和退出码。','请基于当前产品方案，输出一个分支任务的实现计划。先给出文件范围、执行步骤和可验收结果。'),
      make('dispatch','cli','Prompt 分发','COMMAND','done',100,'任务从图谱节点发起，带上模型和权限设置。','设计任务分发结构：prompt、nodeId、模型、权限模式。'),
      make('status','cli','运行状态与日志','MONITOR','running',38,'执行面板展示进程、输出与错误。','定义运行中、完成、失败和取消状态的展示逻辑。'),
      make('observe','execution','主监控板','MONITOR','queued',0,'同一视图汇总正在运行与待验收的节点。','设计任务总览：运行队列、阶段状态、模型与开始时间。'),
      make('verify','execution','检查与验收','REVIEW','review',100,'把过程记录和人工结论放在同一个节点里。','设计任务的运行证据快照和人工验收流程。'),
      make('checkpoint','verify','运行证据记录点','EVIDENCE','done',100,'记录当前状态、日志尾部和进程元数据。','设计记录点内容：时间、状态、退出码、会话 ID 和日志尾部。'),
      make('acceptance','verify','成果验收','REVIEW','queued',0,'用户基于产出确认通过或要求修改。','写出每个节点的验收项和结论字段。'),
      make('validation','root','验证计划','EXPERIMENT','queued',0,'用任务观察检验用户是否能理解分支和执行状态。','设计用户试用任务与观察指标。',true),
      make('interview','validation','重度用户访谈','RESEARCH','queued',0,'了解真实的长对话工作流。','准备 5 个围绕长对话与侧问题的访谈问题。'),
      make('pilot','validation','可用性试用','EXPERIMENT','queued',0,'看用户能否完成开支线、分发、回溯与验收。','设计一个不超过 10 分钟的原型试用任务。')
    ];
    const cli = a.find(n => n.id === 'cli');
    cli.taskId = 'demo-preview-session';
    cli.startedAt = new Date(Date.now()-24000).toISOString();
    cli.logs = [
      {at:new Date(Date.now()-24000).toISOString(),type:'status',text:'演示任务已分发。CLI 尚未连接。'},
      {at:new Date(Date.now()-19000).toISOString(),type:'stdout',text:'已接收节点上下文与 Prompt。'},
      {at:new Date(Date.now()-13000).toISOString(),type:'stdout',text:'正在整理实现范围与验收项…'}
    ];
    cli.checkpoints = [
      {id:'seed-cp-1',label:'上下文已确认',note:'记录点：已保留父节点与当前任务 Prompt。',at:new Date(Date.now()-15000).toISOString()},
      {id:'seed-cp-2',label:'实施计划草稿',note:'记录点：已有计划摘要，等待输出与人工验收。',at:new Date(Date.now()-6000).toISOString()}
    ];
    a.find(n=>n.id==='verify').checkpoints = [{id:'seed-cp-3',label:'验收范围已整理',note:'记录任务状态与产出检查点。',at:new Date(Date.now()-3600000).toISOString()}];
    const verify=a.find(n=>n.id==='verify');
    verify.taskId='demo-review';verify.exitCode=0;verify.finishedAt=new Date(Date.now()-120000).toISOString();
    verify.logs=[{at:verify.finishedAt,type:'status',text:'演示任务已完成，等待人工验收。'}];
    return a;
  }
  function loadSaved() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && Array.isArray(raw.nodes) && raw.nodes.some(n=>n.id==='root')) return raw;
    } catch (_) {}
    return null;
  }
  const saved = loadSaved();
  const state = {
    nodes: saved ? saved.nodes : seedNodes(),
    selectedId: saved && saved.selectedId && saved.nodes.some(n=>n.id===saved.selectedId) ? saved.selectedId : 'cli',
    tab:'overview',scale:.78,panX:0,panY:0,worldW:1500,worldH:900,
    visible:[],bridgeConnected:false,bridgeAvailable:false,initialPositioned:false,
    minimap:null,lastInspectorId:null,realCursors:{},polling:false
  };
  const demoTimers = new Map();
  let toastTimer;
  function persist(){try{localStorage.setItem(KEY,JSON.stringify({nodes:state.nodes,selectedId:state.selectedId}));}catch(_){}}
  function toast(message){const e=$('toast');e.textContent=message;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),2600)}
  function active(){return nodeById(state.selectedId)||state.nodes[0]}
  function pathTo(id){const path=[];let node=nodeById(id);while(node){path.unshift(node);node=nodeById(node.parent)}return path}
  function descendants(id){let result=[];for(const child of children(id)){result.push(child);result=result.concat(descendants(child.id))}return result}
  function layout(){
    let leaf=0,maxDepth=0;
    const visible=[];
    function walk(node,depth){
      maxDepth=Math.max(maxDepth,depth);
      node._x=175+depth*322;
      visible.push(node);
      const kids=node.collapsed?[]:children(node.id);
      if(!kids.length){node._y=108+leaf*126;leaf+=1}
      else{kids.forEach(c=>walk(c,depth+1));node._y=(kids[0]._y+kids[kids.length-1]._y)/2}
    }
    walk(nodeById('root')||state.nodes[0],0);
    state.visible=visible;
    state.worldW=Math.max(750,175+maxDepth*322+190);
    state.worldH=Math.max(620,Math.max(1,leaf)*126+100);
  }
  function edgePath(parent,child){
    const x1=parent._x+118,x2=child._x-116,mid=(x1+x2)/2;
    return 'M '+x1+' '+parent._y+' C '+mid+' '+parent._y+', '+mid+' '+child._y+', '+x2+' '+child._y;
  }
  function renderGraph(){
    const visibleIds=new Set(state.visible.map(n=>n.id));
    const selectedPath=new Set(pathTo(state.selectedId).map(n=>n.id));
    const svg=$('graphEdges'),world=$('graphWorld'),container=$('graphNodes');
    world.style.width=state.worldW+'px';world.style.height=state.worldH+'px';
    svg.setAttribute('viewBox','0 0 '+state.worldW+' '+state.worldH);
    svg.setAttribute('width',String(state.worldW));svg.setAttribute('height',String(state.worldH));
    let edges='';
    state.visible.forEach(n=>{
      if(!n.parent||!visibleIds.has(n.parent))return;
      const p=nodeById(n.parent),d=edgePath(p,n);
      edges+='<path class="edge-base'+(selectedPath.has(n.id)&&selectedPath.has(p.id)?' selected':'')+'" d="'+d+'"/>';
      if(n.status==='running'){
        edges+='<path class="edge-water" d="'+d+'"/>';
        if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)edges+='<circle r="3.4" fill="#bfdef7" opacity=".9"><animateMotion dur="2.4s" repeatCount="indefinite" path="'+d+'"/></circle>';
      }
    });
    svg.innerHTML=edges;
    container.innerHTML=state.visible.map(n=>{
      const kids=children(n.id),hidden=n.collapsed?descendants(n.id).length:0;
      const progress=n.progress==null?42:clamp(n.progress,0,100);
      const indeterminate=n.progress==null&&n.status==='running';
      const growth=n.status==='running'?Math.min(3,Math.max(1,Math.ceil(progress/34))):n.status==='done'||n.status==='accepted'?3:0;
      const fold=kids.length?'<button class="node-fold" data-fold="'+esc(n.id)+'" title="'+(n.collapsed?'展开':'折叠')+' '+kids.length+' 个子分支" aria-label="'+(n.collapsed?'展开':'折叠')+'子分支">'+(n.collapsed?'＋':'−')+'</button>':'';
      const model=n.status==='queued'?'未分发':n.mode==='real'?MODEL[n.model]+' · 本地':MODEL[n.model]+' · 演示';
      const progressText=n.progress==null&&n.status==='running'?'执行中':n.status==='queued'?'待开始':Math.round(progress)+'%';
      return '<div class="graph-node status-'+esc(n.status)+(n.id==='root'?' root':'')+(n.id===state.selectedId?' selected':'')+'" role="button" tabindex="0" data-node="'+esc(n.id)+'" style="left:'+n._x+'px;top:'+n._y+'px" title="'+esc(n.summary)+'">'
        +'<span class="node-bud"></span><span class="node-output"></span><span class="node-leaves growth-'+growth+'"><i></i><i></i><i></i></span>'
        +'<div class="node-head"><span class="node-glyph">'+(n.id==='root'?'✦':n.kind==='CLI TASK'?'⌁':'◇')+'</span><span class="node-category">'+esc(n.kind)+'</span><span class="spacer"></span><span class="node-state-mini"></span>'+fold+'</div>'
        +'<div class="node-title">'+esc(n.title)+'</div><div class="node-subline"><span class="node-model">'+esc(model)+'</span><span>'+(hidden?'<span class="node-hidden-count">＋'+hidden+' 隐藏</span>':progressText)+'</span></div>'
        +'<div class="node-progress'+(indeterminate?' indeterminate':'')+'"><span style="width:'+progress+'%"></span></div></div>';
    }).join('');
  }
  function setTransform(){
    $('graphWorld').style.transform='translate('+state.panX+'px,'+state.panY+'px) scale('+state.scale+')';
    $('zoomValue').textContent=Math.round(state.scale*100)+'%';
    renderMinimap();
  }
  function focusNode(id,scale){
    const n=nodeById(id);if(!n)return;
    for(const ancestor of pathTo(id)){if(ancestor.id!==id)ancestor.collapsed=false}
    layout();renderGraph();
    if(scale!=null)state.scale=scale;
    const vp=$('graphViewport');
    state.panX=vp.clientWidth*.69-n._x*state.scale;
    state.panY=vp.clientHeight*.56-n._y*state.scale;
    state.initialPositioned=true;
    setTransform();persist();
  }
  function fitMap(){
    layout();renderGraph();
    const vp=$('graphViewport');
    state.scale=clamp(Math.min((vp.clientWidth-90)/state.worldW,(vp.clientHeight-55)/state.worldH),.27,1.1);
    state.panX=(vp.clientWidth-state.worldW*state.scale)/2;
    state.panY=(vp.clientHeight-state.worldH*state.scale)/2;
    state.initialPositioned=true;setTransform();
  }
  function zoomAt(delta,x,y){
    const old=state.scale,next=clamp(old*delta,.28,1.4);
    const worldX=(x-state.panX)/old,worldY=(y-state.panY)/old;
    state.scale=next;state.panX=x-worldX*next;state.panY=y-worldY*next;setTransform();
  }
  function renderMinimap(){
    const svg=$('minimap'),vp=$('graphViewport');if(!svg||!vp)return;
    const k=Math.min(168/state.worldW,95/state.worldH),ox=(176-state.worldW*k)/2,oy=(105-state.worldH*k)/2;
    state.minimap={k,ox,oy};
    const ids=new Set(state.visible.map(n=>n.id));
    let html='';
    state.visible.forEach(n=>{if(n.parent&&ids.has(n.parent)){const p=nodeById(n.parent);html+='<path class="minimap-edge" d="M '+(ox+p._x*k)+' '+(oy+p._y*k)+' L '+(ox+n._x*k)+' '+(oy+n._y*k)+'"/>'}});
    state.visible.forEach(n=>{html+='<circle class="minimap-node'+(n.status==='running'?' running':'')+(n.id===state.selectedId?' selected':'')+'" cx="'+(ox+n._x*k)+'" cy="'+(oy+n._y*k)+'" r="'+(n.id==='root'?2.8:2)+'"/>'});
    const vx=(-state.panX/state.scale)*k+ox,vy=(-state.panY/state.scale)*k+oy,vw=vp.clientWidth/state.scale*k,vh=vp.clientHeight/state.scale*k;
    html+='<rect class="minimap-view" x="'+vx+'" y="'+vy+'" width="'+vw+'" height="'+vh+'" rx="2"/>';
    svg.innerHTML=html;
  }
  function renderSidebar(){
    const activeTasks=state.nodes.filter(n=>n.taskId&&['running','review','error'].includes(n.status)&&n.id!=='root').slice(0,5);
    $('sidebarTasks').innerHTML=activeTasks.map(n=>'<button class="sidebar-task" data-task-node="'+esc(n.id)+'"><span class="task-symbol">'+(n.status==='running'?'⌁':n.status==='review'?'◎':'!')+'</span><span><strong>'+esc(n.title)+'</strong><small>'+esc(STATUS[n.status].zh)+' · '+(n.mode==='real'?'本地 CLI':'演示')+'</small></span><i class="task-state '+esc(n.status)+'"></i></button>').join('')||'<div class="empty-list">还没有活动任务</div>';
    $('taskNavCount').textContent=String(activeTasks.length).padStart(2,'0');
    $('checkpointNavCount').textContent=String(state.nodes.reduce((sum,n)=>sum+(n.checkpoints||[]).length,0)).padStart(2,'0');
    const overall=clamp(Math.round((nodeById('root')||{}).progress||0),0,100);
    $('growthValue').textContent=overall;$('growthCount').textContent=overall+'%';
    document.querySelector('.growth-tree').setAttribute('data-growth',String(clamp(Math.ceil(overall/20),0,5)));
    $('headlineNodeCount').textContent=state.nodes.length;
    const openBranches=children('root').length;
    $('graphMeta').textContent=state.nodes.length+' nodes · '+openBranches+' branches · '+state.visible.length+' visible';
    const running=state.nodes.find(n=>n.taskId&&n.status==='running'&&n.id!=='root')||state.nodes.find(n=>n.taskId&&n.status==='review');
    if(running){
      $('stripTitle').textContent=running.title;
      $('stripSubtitle').textContent=running.mode==='real'?'本地 Claude Code · 日志与退出码可查看':running.status==='running'?'演示任务运行中 · 浇灌动画同步':'已完成运行 · 等待人工验收';
      $('stripFill').style.width=(running.progress==null?43:clamp(running.progress,0,100))+'%';
      $('stripPercent').textContent=running.progress==null?'执行中':Math.round(running.progress)+'%';
      $('showRunningNode').dataset.node=running.id;
    }else{
      $('stripTitle').textContent='当前没有运行中的任务';
      $('stripSubtitle').textContent='选中一个节点并分发 Prompt，查看执行轨迹';
      $('stripFill').style.width='0%';$('stripPercent').textContent='—';$('showRunningNode').dataset.node='root';
    }
  }
  function renderInspector(){
    const n=active(),status=STATUS[n.status]||STATUS.queued;
    $('inspectorTitle').textContent=n.title;
    $('nodeKicker').textContent=n.kind+' / '+String(state.nodes.indexOf(n)+1).padStart(2,'0');
    $('inspectorSummary').textContent=n.summary;
    $('stateText').textContent=status.en;
    $('stateDot').parentElement.className='selected-state '+n.status;
    $('nodePath').innerHTML=pathTo(n.id).map((p,i,arr)=>'<button data-path="'+esc(p.id)+'" title="'+esc(p.title)+'">'+esc(p.title)+'</button>'+(i<arr.length-1?'<span class="path-arrow">›</span>':'')).join('');
    if(state.lastInspectorId!==n.id){
      $('promptEditor').value=n.prompt||'';
      $('modelSelect').value=n.model||'sonnet';
      $('permissionSelect').value=n.permission||'plan';
      $('acceptNote').value=(n.acceptance&&n.acceptance.note)||'';
      $('executionMode').value=n.mode==='real'&&state.bridgeAvailable?'real':'demo';
      state.lastInspectorId=n.id;
    }
    $('nodeStatus').textContent=status.zh;
    $('nodeModel').textContent=MODEL[n.model]||MODEL.sonnet;
    $('nodeElapsed').textContent=n.startedAt?Math.max(0,Math.floor((new Date(n.finishedAt||Date.now())-new Date(n.startedAt))/1000))+'s':'—';
    $('modelSelect').disabled=n.status==='running'&&!!n.taskId;
    $('permissionSelect').disabled=n.status==='running'&&!!n.taskId;
    $('dispatchButton').innerHTML=n.status==='running'&&n.taskId?'<span>◉</span> 查看当前运行':'<span>↗</span> 分发给执行代理';
    $('toggleBranchButton').textContent=children(n.id).length?(n.collapsed?'⊞ 展开子分支':'⊟ 折叠子分支'):'暂无子分支';
    $('toggleBranchButton').disabled=!children(n.id).length;
    $('cancelButton').disabled=n.status!=='running'||!n.taskId;
    $('runHint').textContent=$('executionMode').value==='real'?'将启动本机 Claude Code；先在 Plan 模式审阅任务。':'演示运行会生成模拟进度与日志；只有选择本地模式才会调用 CLI。';
    $('inspectorFooterText').textContent=n.mode==='real'?'本地执行状态来自 Claude Code 进程；验收结论由你确认。':'当前节点的执行记录为演示数据。';
    $('logCount').textContent=(n.logs||[]).length;
    $('cpCount').textContent=(n.checkpoints||[]).length;
    $('logsModeLabel').textContent=n.mode==='real'?'本地进程日志':'演示日志';
    $('terminalTaskId').textContent=n.taskId?String(n.taskId).slice(0,22):'no-task';
    $('terminalStatus').textContent=status.en;
    $('logList').innerHTML=(n.logs||[]).length?(n.logs||[]).map(l=>'<div class="log-entry '+esc(l.type)+'"><span class="timestamp">'+esc(shortTime(l.at))+'</span>'+esc(l.text)+'</div>').join(''):'<div class="log-entry status">尚无运行日志。分发任务后，输出会显示在这里。</div>';
    $('processStatus').textContent=n.mode==='real'?(n.status==='running'?'本地进程运行中':status.zh):(n.taskId?'模拟'+status.zh:'未启动');
    $('exitCode').textContent=n.exitCode==null?'—':String(n.exitCode);
    $('outputCount').textContent=(n.logs||[]).filter(l=>l.type==='stdout'||l.type==='stderr').length;
    $('checkpointList').innerHTML=(n.checkpoints||[]).length?(n.checkpoints||[]).map(cp=>'<div class="checkpoint-item"><b>'+esc(cp.label)+'</b><small>'+esc(cp.note||'运行证据记录点')+'</small><em>'+esc(shortTime(cp.at))+'</em></div>').join(''):'<div class="empty-list">尚无记录点。任务运行时可以保存证据快照。</div>';
    $('acceptRunState').textContent=n.status==='running'?'进行中':n.exitCode===0?'退出码 0':n.mode==='demo'&&n.status==='review'?'演示完成':n.taskId?status.zh:'未运行';
    $('acceptOutputState').textContent=(n.logs||[]).length?(n.logs||[]).length+' 条记录':'无记录';
    $('acceptVerdict').textContent=n.acceptance?(n.acceptance.verdict==='pass'?'已通过':'需要修改'):'待人工确认';
    $('acceptPass').disabled=n.status==='running'||!n.taskId;
    $('acceptNeedsWork').disabled=n.status==='running'||!n.taskId;
  }
  function renderAll(){
    layout();renderGraph();renderSidebar();renderInspector();setTransform();persist();
  }
  function selectNode(id,focus=false){
    if(!nodeById(id))return;
    state.selectedId=id;state.lastInspectorId=null;renderAll();
    if(focus)focusNode(id);
    document.dispatchEvent(new CustomEvent('weave:node-selected',{detail:{node:active()}}));
  }
  function switchTab(name){
    state.tab=name;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+name));
  }
  function openBranch(parentId){
    if(parentId)selectNode(parentId);
    $('branchDialog').classList.add('show');
    $('dialogParent').textContent='来源节点：'+active().title;
    $('branchTitle').value='';$('branchPrompt').value='';
    setTimeout(()=>$('branchTitle').focus(),20);
  }
  function closeBranch(){$('branchDialog').classList.remove('show')}
  function createBranch(){
    const title=$('branchTitle').value.trim(),prompt=$('branchPrompt').value.trim();
    if(!title){$('branchTitle').focus();toast('先给这个分支起一个名字');return}
    const parent=active(),id='n-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
    const node={id,parent:parent.id,title,kind:'NEW BRANCH',status:'queued',progress:0,summary:'从「'+parent.title+'」生长的新分支。',prompt:prompt||'请围绕「'+title+'」探索，并给出可执行的下一步。',collapsed:false,model:'sonnet',permission:'plan',mode:'demo',taskId:null,startedAt:null,finishedAt:null,exitCode:null,sessionId:null,resultIsError:false,logs:[],checkpoints:[],acceptance:null};
    parent.collapsed=false;state.nodes.push(node);closeBranch();selectNode(id,true);toast('新分支已加入图谱');
  }
  function addLog(n,type,text){
    n.logs=n.logs||[];n.logs.push({at:new Date().toISOString(),type,text:String(text)});
    if(n.logs.length>150)n.logs.splice(0,n.logs.length-150);
  }
  function addLocalCheckpoint(n,label,note){
    n.checkpoints=n.checkpoints||[];
    n.checkpoints.push({id:'cp-'+Date.now().toString(36),label,note,at:new Date().toISOString()});
  }
  function startDemo(n){
    if(demoTimers.has(n.id))clearInterval(demoTimers.get(n.id));
    n.mode='demo';n.taskId='demo-'+Date.now().toString(36);n.status='running';n.progress=2;
    n.startedAt=new Date().toISOString();n.finishedAt=null;n.exitCode=null;n.acceptance=null;n.checkpoints=[];n.logs=[];
    addLog(n,'status','演示任务已分发。此模式不会调用外部 CLI。');
    renderAll();switchTab('logs');toast('演示任务已启动，观察水流与节点生长');
    startDemoTicker(n);
  }
  function startDemoTicker(n){
    if(demoTimers.has(n.id))return;
    let markedOne=(n.checkpoints||[]).some(cp=>cp.label==='任务范围确认');
    let markedTwo=(n.checkpoints||[]).some(cp=>cp.label==='产出草稿');
    const timer=setInterval(()=>{
      if(n.status!=='running'||n.mode!=='demo'){clearInterval(timer);demoTimers.delete(n.id);return}
      n.progress=clamp((n.progress||0)+2,0,100);
      const root=nodeById('root');if(root&&n.id!=='root')root.progress=clamp((root.progress||60)+.35,0,100);
      if(n.progress>=27&&!markedOne){markedOne=true;addLocalCheckpoint(n,'任务范围确认','已保留节点 Prompt、模型与当前状态。');addLog(n,'stdout','正在拆解任务范围与计划步骤…')}
      if(n.progress>=65&&!markedTwo){markedTwo=true;addLocalCheckpoint(n,'产出草稿','已有阶段性输出；等待后续完成。');addLog(n,'stdout','阶段产出已形成，可进入验收前检查。')}
      if(n.progress>=100){n.status='review';n.exitCode=0;n.finishedAt=new Date().toISOString();addLocalCheckpoint(n,'运行结束','演示任务完成，等待人工验收。');addLog(n,'success','演示任务完成。请在记录点中查看并手动验收。');clearInterval(timer);demoTimers.delete(n.id);toast('演示任务完成，等待人工验收')}
      renderAll();
    },1300);
    demoTimers.set(n.id,timer);
  }
  async function apiPost(path,payload={}){
    const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Weave-Client':'1'},body:JSON.stringify(payload)});
    const json=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(json.error||'本地任务请求失败');
    return json;
  }
  async function connectBridge(silent=false){
    if(location.protocol==='file:'){
      if(!silent)toast('请运行 node server.mjs，再打开 http://127.0.0.1:4173/');
      return;
    }
    try{
      const response=await fetch('/api/health',{cache:'no-store'});
      if(!response.ok)throw new Error('本地服务未响应');
      const data=await response.json();
      state.bridgeConnected=!!data.ok;state.bridgeAvailable=!!data.provider?.available;
      $('connectorTitle').textContent=data.provider?.label||'Claude Code';
      $('connectorSubtitle').textContent=state.bridgeAvailable?'本地桥接已连接 · 等待分发':'本地桥接已连接 · 未检测到 CLI';
      $('connectorLight').classList.toggle('connected',state.bridgeAvailable);
      $('topbarMode').classList.toggle('connected',state.bridgeAvailable);
      $('topbarMode').innerHTML=state.bridgeAvailable?'<i></i> 本地 CLI 可用':'<i></i> 演示运行';
      $('connectButton').innerHTML=state.bridgeAvailable?'本地 Claude Code 已就绪 <span>✓</span>':'重新检测 Claude Code <span>↗</span>';
      const real=$('executionMode').querySelector('option[value="real"]');
      real.disabled=!state.bridgeAvailable;
      real.textContent=state.bridgeAvailable?'本地 Claude Code（真实）':'本地 Claude Code（未连接）';
      if(!state.bridgeAvailable&&$('executionMode').value==='real')$('executionMode').value='demo';
      if(!silent)toast(state.bridgeAvailable?'已连接本机 Claude Code，可分发真实任务':'桥接已启动，但未检测到 Claude Code');
      if(state.bridgeAvailable){state.lastInspectorId=null;await restoreRealTasks();}
    }catch(err){
      state.bridgeConnected=false;state.bridgeAvailable=false;
      $('connectorSubtitle').textContent='演示模式 · 本地桥接未连接';
      if(!silent)toast('未连接本地桥接：'+err.message);
    }
  }
  async function restoreRealTasks(){
    try{
      const res=await fetch('/api/tasks',{cache:'no-store'});if(!res.ok)return;
      const data=await res.json();
      for(const task of data.tasks||[]){
        const n=nodeById(task.nodeId);
        if(n&&n.mode==='real'&&n.taskId===task.id)mapRealSnapshot(n,task);
      }
      renderAll();
    }catch(_){}
  }
  function mapRealSnapshot(n,task){
    n.mode='real';n.taskId=task.id;n.startedAt=task.startedAt;n.finishedAt=task.finishedAt;
    n.exitCode=task.exitCode;n.sessionId=task.sessionId;n.resultIsError=!!task.resultIsError;
    n.model=task.model||n.model;n.permission=task.permissionMode||n.permission;
    n.checkpoints=task.checkpoints||[];
    n.acceptance=task.acceptance||null;
    n.status=task.acceptance?.verdict==='pass'?'accepted':task.status==='running'?'running':task.status==='completed'?'review':task.status==='failed'?'error':task.status==='cancelled'?'cancelled':'queued';
    n.progress=task.status==='running'?null:task.status==='completed'?100:task.status==='failed'?0:n.progress;
  }
  async function dispatchReal(n){
    if(!state.bridgeAvailable){toast('本地 Claude Code 尚未连接');return}
    try{
      const data=await apiPost('/api/tasks',{prompt:n.prompt,nodeId:n.id,title:n.title,model:n.model,permissionMode:n.permission});
      n.logs=[];n.checkpoints=[];n.acceptance=null;state.realCursors[data.task.id]=0;
      mapRealSnapshot(n,data.task);renderAll();switchTab('logs');
      toast('真实任务已提交给本机 Claude Code');
    }catch(err){toast('分发失败：'+err.message)}
  }
  async function pollReal(){
    if(state.polling)return;
    const tasks=state.nodes.filter(n=>n.mode==='real'&&n.taskId&&n.status==='running');
    if(!tasks.length)return;
    state.polling=true;
    try{
      for(const n of tasks){
        const snapshot=await fetch('/api/tasks/'+encodeURIComponent(n.taskId),{cache:'no-store'}).then(r=>r.json());
        if(snapshot.task)mapRealSnapshot(n,snapshot.task);
        const after=state.realCursors[n.taskId]||0;
        const events=await fetch('/api/tasks/'+encodeURIComponent(n.taskId)+'/events?after='+after,{cache:'no-store'}).then(r=>r.json());
        if(Array.isArray(events.events)){
          n.logs=n.logs||[];
          events.events.forEach(e=>n.logs.push({at:e.at,type:e.type,text:e.text}));
          if(n.logs.length>150)n.logs.splice(0,n.logs.length-150);
          state.realCursors[n.taskId]=events.nextSeq||after;
        }
      }
      renderAll();
    }catch(err){toast('本地状态读取失败：'+err.message)}
    finally{state.polling=false}
  }
  async function recordCheckpoint(){
    const n=active();if(!n.taskId){toast('请先分发任务，再记录执行快照');return}
    const label='记录点 '+((n.checkpoints||[]).length+1);
    if(n.mode==='real'){
      try{const data=await apiPost('/api/tasks/'+encodeURIComponent(n.taskId)+'/checkpoints',{label,note:'由织思面板记录的运行状态与输出片段。'});n.checkpoints.push(data.checkpoint);renderAll();switchTab('accept');toast('已保存运行证据快照')}
      catch(err){toast('保存失败：'+err.message)}
    }else{addLocalCheckpoint(n,label,'演示状态 '+STATUS[n.status].zh+'；进度 '+(n.progress||0)+'%。');renderAll();switchTab('accept');toast('已保存演示记录点')}
  }
  async function accept(verdict){
    const n=active();if(!n.taskId||n.status==='running'){toast('请等待任务结束后再验收');return}
    const note=$('acceptNote').value.trim();
    if(n.mode==='real'){
      try{const data=await apiPost('/api/tasks/'+encodeURIComponent(n.taskId)+'/accept',{verdict,note});n.acceptance=data.acceptance;n.status=verdict==='pass'?'accepted':'review';renderAll();toast(verdict==='pass'?'已记录人工验收通过':'已记录需要修改')}
      catch(err){toast('验收记录失败：'+err.message)}
    }else{n.acceptance={verdict,note,at:new Date().toISOString()};n.status=verdict==='pass'?'accepted':'review';renderAll();toast(verdict==='pass'?'已记录演示验收通过':'已标记需要修改')}
  }
  async function cancelTask(){
    const n=active();if(n.status!=='running'||!n.taskId)return;
    if(n.mode==='real'){
      try{const data=await apiPost('/api/tasks/'+encodeURIComponent(n.taskId)+'/cancel');mapRealSnapshot(n,data.task);addLog(n,'status','已请求取消本地进程。');renderAll();toast('已请求停止本地任务')}
      catch(err){toast('停止失败：'+err.message)}
    }else{
      if(demoTimers.has(n.id)){clearInterval(demoTimers.get(n.id));demoTimers.delete(n.id)}
      n.status='cancelled';n.finishedAt=new Date().toISOString();addLog(n,'status','演示任务已停止。');renderAll();toast('演示任务已停止');
    }
  }
  function bind(){
    $('graphNodes').addEventListener('click',event=>{
      const fold=event.target.closest('[data-fold]');
      if(fold){event.stopPropagation();const n=nodeById(fold.dataset.fold);if(n){n.collapsed=!n.collapsed;renderAll();focusNode(n.id)}return}
      const item=event.target.closest('[data-node]');if(item)selectNode(item.dataset.node);
    });
    $('graphNodes').addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const item=event.target.closest('[data-node]');if(item){event.preventDefault();selectNode(item.dataset.node)}
    });
    $('sidebarTasks').addEventListener('click',event=>{const el=event.target.closest('[data-task-node]');if(el)selectNode(el.dataset.taskNode,true)});
    $('nodePath').addEventListener('click',event=>{const el=event.target.closest('[data-path]');if(el)selectNode(el.dataset.path,true)});
    document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.tab)));
    document.querySelectorAll('.nav-button').forEach(button=>button.addEventListener('click',()=>{
      document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b===button));
      if(button.dataset.nav==='tasks'){const n=state.nodes.find(x=>x.taskId&&x.status==='running'&&x.id!=='root');if(n)selectNode(n.id,true);switchTab('logs')}
      if(button.dataset.nav==='checkpoints'){const n=state.nodes.find(x=>x.status==='review')||active();selectNode(n.id,true);switchTab('accept')}
      if(button.dataset.nav==='map')switchTab('overview');
    }));
    $('openTaskBoard').onclick=()=>{const n=state.nodes.find(x=>x.taskId&&x.status==='running'&&x.id!=='root');if(n)selectNode(n.id,true);switchTab('logs')};
    $('workspaceCurrent').onclick=()=>{selectNode('root',true);switchTab('overview')};
    $('showRunningNode').onclick=()=>{selectNode($('showRunningNode').dataset.node,true);switchTab('logs')};
    $('focusSelected').onclick=()=>focusNode(state.selectedId);
    $('fitMap').onclick=fitMap;
    $('zoomIn').onclick=()=>{const v=$('graphViewport');zoomAt(1.17,v.clientWidth/2,v.clientHeight/2)};
    $('zoomOut').onclick=()=>{const v=$('graphViewport');zoomAt(1/1.17,v.clientWidth/2,v.clientHeight/2)};
    $('collapseAll').onclick=()=>{
      const roots=children('root'),all=roots.every(n=>n.collapsed);
      roots.forEach(n=>n.collapsed=!all);
      $('collapseAll').querySelector('span').textContent=all?'折叠全部':'展开全部';
      renderAll();focusNode('root',state.scale);
    };
    $('minimap').addEventListener('click',event=>{
      const box=$('minimap').getBoundingClientRect(),m=state.minimap;if(!m)return;
      const worldX=(event.clientX-box.left-m.ox)/m.k,worldY=(event.clientY-box.top-m.oy)/m.k;
      const vp=$('graphViewport');
      state.panX=vp.clientWidth/2-worldX*state.scale;state.panY=vp.clientHeight/2-worldY*state.scale;setTransform();
    });
    const vp=$('graphViewport');let drag=null;
    vp.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.target.closest('.graph-node,.minimap-wrap'))return;
      drag={x:event.clientX,y:event.clientY,px:state.panX,py:state.panY};
      vp.setPointerCapture(event.pointerId);vp.classList.add('dragging');
    });
    vp.addEventListener('pointermove',event=>{if(!drag)return;state.panX=drag.px+event.clientX-drag.x;state.panY=drag.py+event.clientY-drag.y;setTransform()});
    function endDrag(){drag=null;vp.classList.remove('dragging')}
    vp.addEventListener('pointerup',endDrag);vp.addEventListener('pointercancel',endDrag);
    vp.addEventListener('wheel',event=>{event.preventDefault();const box=vp.getBoundingClientRect();zoomAt(event.deltaY<0?1.09:1/1.09,event.clientX-box.left,event.clientY-box.top)},{passive:false});
    window.addEventListener('resize',()=>{if(state.initialPositioned)setTransform()});
    $('addBranchButton').onclick=()=>openBranch();
    $('newExploration').onclick=()=>openBranch('root');
    $('closeDialog').onclick=closeBranch;$('cancelDialog').onclick=closeBranch;
    $('branchDialog').addEventListener('click',event=>{if(event.target===$('branchDialog'))closeBranch()});
    $('createBranch').onclick=createBranch;
    $('branchTitle').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();createBranch()}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeBranch()});
    $('toggleBranchButton').onclick=()=>{const n=active();if(children(n.id).length){n.collapsed=!n.collapsed;renderAll();focusNode(n.id)}};
    $('promptEditor').addEventListener('input',event=>{active().prompt=event.target.value;persist()});
    $('modelSelect').addEventListener('change',event=>{active().model=event.target.value;renderAll()});
    $('permissionSelect').addEventListener('change',event=>{active().permission=event.target.value;persist()});
    $('executionMode').addEventListener('change',()=>renderInspector());
    $('dispatchButton').onclick=()=>{
      const n=active();
      n.prompt=$('promptEditor').value.trim();n.model=$('modelSelect').value;n.permission=$('permissionSelect').value;
      if(!n.prompt){toast('先写下要分发的 Prompt');$('promptEditor').focus();return}
      if(n.status==='running'&&n.taskId){switchTab('logs');toast('当前任务正在运行；停止后可重新分发');return}
      if($('executionMode').value==='real')dispatchReal(n);else startDemo(n);
    };
    $('cancelButton').onclick=cancelTask;
    $('connectButton').onclick=()=>connectBridge(false);
    $('connectorCard').onclick=()=>connectBridge(false);
    $('addCheckpointButton').onclick=recordCheckpoint;
    $('acceptPass').onclick=()=>accept('pass');
    $('acceptNeedsWork').onclick=()=>accept('needs-work');
    $('resetSample').onclick=()=>{
      if(!window.confirm('重置示例图谱？本地新增的分支与演示记录会被清除。'))return;
      demoTimers.forEach(timer=>clearInterval(timer));demoTimers.clear();
      state.nodes=seedNodes();state.selectedId='cli';state.lastInspectorId=null;state.realCursors={};
      renderAll();focusNode('cli',.78);switchTab('overview');startDemoTicker(nodeById('cli'));toast('已恢复 V2 示例图谱');
    };
  }
  window.WeaveApp={
    selectNode,
    focusNode,
    fitMap,
    openRootBranch:()=>openBranch('root'),
    getSelected:()=>active(),
    getNodeCount:()=>state.nodes.length,
    replaceGraphFromIdeas(candidates,sourceThreadId){
      const accepted=Array.isArray(candidates)?candidates.filter(item=>item&&item.included!==false):[];
      if(!accepted.length)throw new Error('请至少保留一个候选想法');
      const rootCandidate=accepted.find(item=>item.id==='idea-root')||accepted[0];
      const idMap=new Map([[rootCandidate.id,'root']]);
      for(const item of accepted)if(item!==rootCandidate)idMap.set(item.id,'chat-'+item.id);
      const nodeFor=item=>{
        const isRoot=item===rootCandidate;
        const rawParent=isRoot?null:item.parent;
        const parent=isRoot?null:(idMap.get(rawParent)||'root');
        return {
          id:idMap.get(item.id),parent,
          title:String(item.title||'未命名想法').trim().slice(0,70),
          kind:isRoot?'CHAT TOPIC':String(item.kind||'IDEA'),
          status:'queued',progress:0,
          summary:String(item.summary||item.prompt||'来自当前对话').slice(0,280),
          prompt:String(item.prompt||item.summary||''),
          collapsed:false,model:'sonnet',permission:'plan',mode:'demo',
          taskId:null,startedAt:null,finishedAt:null,exitCode:null,sessionId:null,
          resultIsError:false,logs:[],checkpoints:[],acceptance:null,
          sourceChatThreadId:sourceThreadId||null,
          sourceIds:Array.isArray(item.sourceIds)?item.sourceIds.slice():[],
          sourceIndexes:Array.isArray(item.sourceIndexes)?item.sourceIndexes.slice():[],
          sourceReason:String(item.reason||'')
        };
      };
      demoTimers.forEach(timer=>clearInterval(timer));demoTimers.clear();
      state.nodes=[nodeFor(rootCandidate),...accepted.filter(item=>item!==rootCandidate).map(nodeFor)];
      state.selectedId='root';state.lastInspectorId=null;state.realCursors={};
      renderAll();switchTab('overview');
      document.dispatchEvent(new CustomEvent('weave:map-replaced',{detail:{count:state.nodes.length,sourceThreadId}}));
      return state.nodes.length;
    }
  };
  bind();renderAll();switchTab('overview');
  setTimeout(()=>focusNode(state.selectedId,.78),50);
  for(const n of state.nodes)if(n.status==='running'&&n.mode==='demo'&&n.taskId)startDemoTicker(n);
  if(location.protocol!=='file:')connectBridge(true);
  setInterval(pollReal,1600);
})();
