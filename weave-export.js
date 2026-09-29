/* Export the current idea map as a real .docx outline or a .pptx deck. Dependency-free OOXML. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const X=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  /* ---- 最小 ZIP 写入器（仅存储，不压缩） ---- */
  const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
  const crc32=u8=>{let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRC_TABLE[(c^u8[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0};
  const concat=parts=>{let n=0;parts.forEach(p=>n+=p.length);const out=new Uint8Array(n);let o=0;parts.forEach(p=>{out.set(p,o);o+=p.length});return out};
  function zipStore(files){
    const enc=new TextEncoder(),local=[],central=[];let offset=0;
    const now=new Date(),time=((now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1))&0xFFFF,date=(((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate())&0xFFFF;
    for(const f of files){
      const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data),size=data.length;
      const h=new DataView(new ArrayBuffer(30));
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,time,true);h.setUint16(12,date,true);
      h.setUint32(14,crc,true);h.setUint32(18,size,true);h.setUint32(22,size,true);h.setUint16(26,name.length,true);
      local.push(new Uint8Array(h.buffer),name,data);
      const c=new DataView(new ArrayBuffer(46));
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,time,true);c.setUint16(14,date,true);
      c.setUint32(16,crc,true);c.setUint32(20,size,true);c.setUint32(24,size,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
      central.push(new Uint8Array(c.buffer),name);
      offset+=30+name.length+size;
    }
    let centralSize=0;central.forEach(p=>centralSize+=p.length);
    const e=new DataView(new ArrayBuffer(22));
    e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    return concat([...local,...central,new Uint8Array(e.buffer)]);
  }
  /* ---- 图谱数据 ---- */
  function mapData(){
    const nodes=window.WeaveApp?.getNodes?.()||[];
    const root=nodes.find(n=>n.id==='root');
    if(!root)return null;
    const children=id=>nodes.filter(n=>n.parent===id);
    const thread=root.sourceChatThreadId?(window.WeaveChat?.getThreads?.()||[]).find(t=>t.id===root.sourceChatThreadId):null;
    return {root,children,count:nodes.length,sourceTitle:thread?.title||''};
  }
  const safeName=s=>String(s||'idea-map').replace(/[\\/:*?"<>|\r\n]+/g,'-').replace(/\s+/g,' ').trim().slice(0,40)||'idea-map';
  /* ---- .docx：按层级生成大纲文档 ---- */
  const DOC_P=(text,{sz=21,b=false,color='3A3644',before=120,after=60}={})=>'<w:p><w:pPr><w:spacing w:before="'+before+'" w:after="'+after+'"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei"/><w:color w:val="'+color+'"/>'+(b?'<w:b/>':'')+'<w:sz w:val="'+sz+'"/><w:szCs w:val="'+sz+'"/></w:rPr><w:t xml:space="preserve">'+X(text)+'</w:t></w:r></w:p>';
  function buildDocx(){
    const data=mapData();if(!data)return null;
    const statusZh={queued:'待探索',running:'运行中',review:'待验收',done:'已完成',accepted:'已验收',error:'运行失败',cancelled:'已停止'};
    let body=DOC_P(data.root.title,{sz:44,b:true,color:'241F33',before:0,after:80});
    body+=DOC_P(new Date().toLocaleDateString('zh-CN')+' · Weave Idea Map · '+data.count+' 个想法节点'+(data.sourceTitle?' · 来源：'+data.sourceTitle:''),{sz:18,color:'8B8797',before:0,after:240});
    (function walk(id,depth){
      for(const node of data.children(id)){
        const style=depth===0?{sz:30,b:true,color:'3A3450',before:340,after:80}:depth===1?{sz:26,b:true,color:'4A4460',before:280,after:70}:{sz:23,b:true,color:'5C5674',before:240,after:60};
        body+=DOC_P(depth>0?'  '.repeat(depth-1)+(depth===1?'一、':'· ')+node.title:node.title,style);
        for(const line of String(node.summary||'').split('\n'))if(line.trim())body+=DOC_P(line.trim(),{sz:21,color:'4E4A5C'});
        body+=DOC_P('状态：'+(statusZh[node.status]||node.status)+' · 模型：'+(MODEL_LABEL[node.model]||node.model),{sz:17,color:'928E9E',before:40,after:120});
        walk(node.id,depth+1);
      }
    })('root',0);
    const documentXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
    const bytes=zipStore([
      {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'},
      {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
      {name:'word/document.xml',data:documentXml}
    ]);
    return {bytes,filename:'Weave-'+safeName(data.root.title)+'.docx'};
  }
  const MODEL_LABEL={opus:'Claude Opus',sonnet:'Claude Sonnet',haiku:'Claude Haiku'};
  /* ---- .pptx：封面 + 每个一级分支一页 ---- */
  const NS='xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const spTreeOpen='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
  const textSp=(id,x,y,w,h,paras)=>'<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="Box '+id+'"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+w+'" cy="'+h+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square" anch="'+(id===2?'b':'t')+'"><a:normAutofit/></a:bodyPr><a:lstStyle/>'+paras+'</p:txBody></p:sp>';
  const para=(text,{sz=1400,b=false,color='C9C5D4',marL=0}={})=>'<a:p><a:pPr marL="'+marL+'" indent="0"><a:spcBef><a:spcPts val="800"/></a:spcBef></a:pPr><a:r><a:rPr lang="zh-CN" sz="'+sz+'" b="'+(b?'1':'0')+'" dirty="0"><a:solidFill><a:srgbClr val="'+color+'"/></a:solidFill></a:rPr><a:t>'+X(text)+'</a:t></a:r></a:p>';
  const slideXml=(paras,title)=>'<p:sld '+NS+'><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="131218"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>'+spTreeOpen+
    '<p:sp><p:nvSpPr><p:cNvPr id="9" name="Accent"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="2057400"/><a:ext cx="1295400" cy="28575"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="B7A6FF"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>'+
    textSp(2,914400,640080,10363200,1280160,para(title,{sz:3000,b:true,color:'EDE9F7'}))+
    textSp(3,914400,2286000,10363200,4114800,paras)+
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  function buildSlides(){
    const data=mapData();if(!data)return null;
    const slides=[];
    slides.push(slideXml(
      para(new Date().toLocaleDateString('zh-CN')+' · Weave 导出',{sz:1300,color:'9A96A8'})+para(data.count+' 个想法节点'+(data.sourceTitle?' · 来源对话：'+data.sourceTitle:''),{sz:1300,color:'9A96A8'}),
      data.root.title));
    for(const branch of data.children('root')){
      const bullets=[];let truncated=0;
      (function walk(id,depth){
        for(const node of data.children(id)){
          if(bullets.length>=9){truncated+=1+data.children(node.id).length;continue}
          bullets.push(para((depth===0?'• ':'– ')+node.title,{sz:depth===0?1500:1250,color:depth===0?'CFCBDB':'9E9AAE',marL:depth===0?0:228600}));
          if(node.summary)bullets.push(para(String(node.summary).split('\n')[0].slice(0,60),{sz:1050,color:'7A7688',marL:depth===0?228600:457200}));
          walk(node.id,depth+1);
        }
      })(branch.id,0);
      if(truncated)bullets.push(para('（其余 '+truncated+' 个子想法见图谱）',{sz:1050,color:'6A6678',marL:0}));
      slides.push(slideXml(bullets.length?bullets.join(''):para('（此分支暂无子想法）',{sz:1200,color:'7A7688'}),branch.title));
    }
    return {data,slides};
  }
  function buildPptx(){
    const built=buildSlides();if(!built)return null;
    const {slides}=built;
    const files=[
      {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'+slides.map((_,i)=>'<Override PartName="/ppt/slides/slide'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>').join('')+'</Types>'},
      {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'},
      {name:'ppt/presentation.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentation '+NS+'><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>'+slides.map((_,i)=>'<p:sldId id="'+(256+i)+'" r:id="rId'+(i+2)+'"/>').join('')+'</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'},
      {name:'ppt/_rels/presentation.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/presentationml/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'+slides.map((_,i)=>'<Relationship Id="rId'+(i+2)+'" Type="http://schemas.openxmlformats.org/presentationml/2006/relationships/slide" Target="slides/slide'+(i+1)+'.xml"/>').join('')+'</Relationships>'},
      {name:'ppt/slideMasters/slideMaster1.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sldMaster '+NS+'><p:cSld><p:spTree>'+spTreeOpen+'</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>'},
      {name:'ppt/slideMasters/_rels/slideMaster1.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/presentationml/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>'},
      {name:'ppt/slideLayouts/slideLayout1.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sldLayout '+NS+' type="blank"><p:cSld name="Blank"><p:spTree>'+spTreeOpen+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'},
      {name:'ppt/slideLayouts/_rels/slideLayout1.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/presentationml/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'},
      {name:'ppt/theme/theme1.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Weave"><a:themeElements><a:clrScheme name="Weave"><a:dk1><a:srgbClr val="131218"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="3A3450"/></a:dk2><a:lt2><a:srgbClr val="EDE9F7"/></a:lt2><a:accent1><a:srgbClr val="B7A6FF"/></a:accent1><a:accent2><a:srgbClr val="7AA0FF"/></a:accent2><a:accent3><a:srgbClr val="FF9ECF"/></a:accent3><a:accent4><a:srgbClr val="8B5CF6"/></a:accent4><a:accent5><a:srgbClr val="5F8BFF"/></a:accent5><a:accent6><a:srgbClr val="C779E0"/></a:accent6><a:hlink><a:srgbClr val="7AA0FF"/></a:hlink><a:folHlink><a:srgbClr val="B7A6FF"/></a:folHlink></a:clrScheme><a:fontScheme name="Weave"><a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Weave"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'}
    ];
    slides.forEach((xml,i)=>files.push({name:'ppt/slides/slide'+(i+1)+'.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+xml},{name:'ppt/slides/_rels/slide'+(i+1)+'.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/presentationml/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>'}));
    return {bytes:zipStore(files),filename:'Weave-'+safeName(built.data.root.title)+'.pptx'};
  }
  /* ---- 下载与弹层 ---- */
  function download(name,bytes,mime){
    const url=URL.createObjectURL(new Blob([bytes],{type:mime}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }
  const pop=document.createElement('section');pop.id='exportPopover';pop.className='settings-popover export-popover';pop.setAttribute('aria-label','导出');
  pop.innerHTML='<div class="history-head"><span>导出</span><button id="closeExport" aria-label="关闭导出">×</button></div><p class="export-meta" id="exportMeta"></p><button class="export-option" id="exportDocx"><b>导出 Word 文档</b><small>按图谱层级生成大纲文档（.docx）</small></button><button class="export-option" id="exportPptx"><b>导出幻灯片</b><small>封面 + 每个一级分支一页（.pptx）</small></button><p class="export-note">内容由当前 Idea Map 生成，本地完成，不上传任何内容。</p>';
  document.body.append(pop);
  function refreshMeta(){
    const data=mapData();
    const branches=data?data.children('root').length:0;
    $('exportMeta').textContent=data?data.count+' 个想法节点 · '+branches+' 条一级分支':'还没有 Idea Map：先在对话中「看见结构」';
    $('exportDocx').disabled=!data;$('exportPptx').disabled=!data;
  }
  $('railExport').onclick=()=>{const show=!pop.classList.contains('show');pop.classList.toggle('show',show);if(show)refreshMeta()};
  $('closeExport').onclick=()=>pop.classList.remove('show');
  $('exportDocx').onclick=()=>{const out=buildDocx();if(out)download(out.filename,out.bytes,'application/vnd.openxmlformats-officedocument.wordprocessingml.document')};
  $('exportPptx').onclick=()=>{const out=buildPptx();if(out)download(out.filename,out.bytes,'application/vnd.openxmlformats-officedocument.presentationml.presentation')};
  document.addEventListener('keydown',event=>{if(event.key==='Escape')pop.classList.remove('show')});
  window.WeaveExport={buildDocx,buildPptx};
})();
