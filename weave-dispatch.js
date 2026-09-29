/* Agent dispatch module: per-node model selection + a sequential queue over the local bridge. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const app=$('app');
  const MODELS=[['opus','Opus · 深度'],['sonnet','Sonnet · 均衡'],['haiku','Haiku · 轻量']];
  const STATUS_LABEL={queued:'待探索',running:'运行中',review:'待验收',done:'已完成',accepted:'已验收',error:'运行失败',cancelled:'已停止'};
  const sheet=document.createElement('section');sheet.id='dispatchSheet';sheet.className='dispatch-sheet';sheet.setAttribute('aria-label','任务分发');
  sheet.innerHTML=`<div class="dispatch-head"><span>任务分发</span><div class="dispatch-bridge" id="dispatchBridge"><i></i><em>检测本地桥接…</em><button id="dispatchReconnect">重新检测</button></div><button id="closeDispatch" aria-label="关闭任务分发">×</button></div>
    <div class="dispatch-strategy"><div><b>按层级分配模型</b><small>主题与分支用更强的模型负责拆解；叶子节点用轻量模型执行。每个节点都可改为任意模型。</small></div><button id="smartAssign">智能分配 ↯</button></div>
    <div class="dispatch-list" id="dispatchList"></div>
    <div class="dispatch-foot"><span class="dispatch-queue-note" id="queueNote">勾选要执行的节点</span><select id="dispatchMode" aria-label="执行方式"><option value="demo">演示运行</option><option value="real" disabled>本地 Claude Code</option></select><button id="dispatchRun">分发所选 ↗</button><button id="dispatchStop" hidden>停止队列</button></div>`;
  document.body.append(sheet);
  let queue=[],running=false,stopping=false,lastSignature='';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function renderBridge(state){
    const el=$('dispatchBridge');
    el.classList.toggle('connected',!!state?.available);
    el.querySelector('em').textContent=state?.available?'本地 Claude Code 已连接':state?.connected?'桥接已连接 · 未检测到 CLI':'本地桥接未连接 · 演示运行';
    const real=$('dispatchMode').querySelector('option[value="real"]');
    real.disabled=!state?.available;real.textContent=state?.available?'本地 Claude Code':'本地 Claude Code（未连接）';
    if(!state?.available&&$('dispatchMode').value==='real')$('dispatchMode').value='demo';
  }
  async function checkBridge(){
    if(location.protocol==='file:'){renderBridge(null);return}
    try{const r=await fetch('/api/health',{cache:'no-store'});renderBridge(await r.json())}
    catch(_){renderBridge(null)}
  }
  function orderedNodes(){
    const nodes=window.WeaveApp?.getNodes?.()||[];
    if(!nodes.some(n=>n.id==='root'))return [];
    const out=[nodes.find(n=>n.id==='root')];
    (function walk(id){nodes.filter(n=>n.parent===id).forEach(k=>{out.push(k);walk(k.id)})})('root');
    return out;
  }
  function depthOf(nodes,node){let d=0,guard=0;while(node.parent&&guard++<64){node=nodes.find(n=>n.id===node.parent);if(!node)break;d++}return d}
  function renderList(force=false){
    const list=$('dispatchList');
    const nodes=window.WeaveApp?.getNodes?.()||[];
    const root=nodes.find(n=>n.id==='root');
    if(!root){list.innerHTML='<div class="empty-list">先从对话生成 Idea Map，再在这里分发任务。</div>';return}
    const signature=nodes.map(n=>n.id+n.status+n.model).join('|');
    if(!force&&signature===lastSignature)return;
    lastSignature=signature;
    const rows=orderedNodes().map(node=>{
      const depth=depthOf(nodes,node);
      const inQueue=queue.includes(node.id);
      return '<div class="dispatch-row'+(depth===0?' root':'')+'">'+
        '<input type="checkbox" class="dispatch-check" data-check="'+node.id+'"'+(depth>0&&node.status!=='running'?' checked':'')+(node.status==='running'?' disabled':'')+' aria-label="选择'+node.title+'"/>'+
        '<span class="dispatch-indent" style="width:'+(depth*15)+'px"></span>'+
        '<button class="dispatch-title" data-goto="'+node.id+'" title="'+node.title+'">'+node.title+'</button>'+
        '<span class="dispatch-status '+node.status+'">'+(STATUS_LABEL[node.status]||node.status)+(inQueue?' · 排队':'')+'</span>'+
        '<select class="dispatch-model" data-model="'+node.id+'" aria-label="执行模型">'+MODELS.map(m=>'<option value="'+m[0]+'"'+(node.model===m[0]?' selected':'')+'>'+m[1]+'</option>').join('')+'</select>'+
        '<button class="dispatch-send" data-send="'+node.id+'" title="分发这个节点">↗</button></div>';
    }).join('');
    list.innerHTML=rows;
  }
  function renderFoot(){
    $('queueNote').textContent=stopping?'正在停止队列…':running?(queue.length?'队列剩余 '+queue.length+' 个，执行完自动继续':'正在执行当前任务…'):'勾选要执行的节点，或单独分发某一个';
    $('dispatchRun').hidden=running;
    $('dispatchStop').hidden=!running;
  }
  async function runQueue(){
    if(running)return;
    running=true;stopping=false;renderFoot();
    const mode=$('dispatchMode').value;
    while(queue.length&&!stopping){
      const id=queue[0];
      let node=window.WeaveApp.getNodes().find(x=>x.id===id);
      if(!node){queue.shift();continue}
      if(node.status==='running'&&node.taskId){await sleep(1600);continue}
      const sent=window.WeaveApp.dispatchNode(id,mode);
      queue.shift();renderFoot();
      if(sent){
        /* 桥接一次只允许一个真实任务：等这个节点结束后再发下一个；停止请求会立即中止等待 */
        let guard=0;
        do{await sleep(1600);node=window.WeaveApp.getNodes().find(x=>x.id===id);guard+=1}while(node&&node.status==='running'&&!stopping&&guard<400);
      }
      renderList(true);
    }
    running=false;stopping=false;renderFoot();renderList(true);
  }
  $('railDispatch').onclick=()=>{const show=!sheet.classList.contains('show');sheet.classList.toggle('show',show);if(show){renderBridge(window.WeaveApp?.getBridgeState?.());renderList(true);renderFoot();checkBridge()}};
  $('closeDispatch').onclick=()=>sheet.classList.remove('show');
  $('dispatchReconnect').onclick=checkBridge;
  $('smartAssign').onclick=()=>{
    const nodes=window.WeaveApp.getNodes();
    let changed=0;
    for(const node of nodes){
      const depth=depthOf(nodes,node);
      const want=depth===0?'opus':depth===1?'sonnet':'haiku';
      if(node.model!==want&&window.WeaveApp.setNodeModel(node.id,want))changed+=1;
    }
    renderList(true);
    const box=$('toast');box.textContent=changed?'已按层级分配：主题 Opus · 分支 Sonnet · 叶子 Haiku':'层级模型已是最新';
    box.classList.add('show');clearTimeout($('smartAssign')._t);$('smartAssign')._t=setTimeout(()=>box.classList.remove('show'),2600);
  };
  $('dispatchList').addEventListener('change',event=>{
    const select=event.target.closest('[data-model]');
    if(select)window.WeaveApp.setNodeModel(select.dataset.model,select.value);
  });
  $('dispatchList').addEventListener('click',event=>{
    const send=event.target.closest('[data-send]');
    if(send){window.WeaveApp.dispatchNode(send.dataset.send,$('dispatchMode').value);renderList(true);return}
    const goto=event.target.closest('[data-goto]');
    if(goto){window.WeaveChat.setView('map');window.WeaveApp.selectNode(goto.dataset.goto,true)}
  });
  $('dispatchRun').onclick=()=>{
    const ids=[...document.querySelectorAll('.dispatch-check:checked:not(:disabled)')].map(c=>c.dataset.check);
    if(!ids.length){const box=$('toast');box.textContent='先勾选要执行的节点';box.classList.add('show');setTimeout(()=>box.classList.remove('show'),2400);return}
    queue=ids;renderList(true);runQueue();
  };
  $('dispatchStop').onclick=()=>{stopping=true;queue=[];renderFoot()};
  document.addEventListener('keydown',event=>{if(event.key==='Escape')sheet.classList.remove('show')});
  setInterval(()=>{if(sheet.classList.contains('show'))renderList()},2000);
})();
