# Weave · Spatial conversation prototype

Weave 让长对话中的侧问题从原句展开，探索后回到准确位置，再把值得保留的发现连成图谱。

## 打开与体验

直接用 Chrome / Edge 打开 [index.html](index.html)。新浏览器会进入示例长对话。

**老师阅览：点击右上角紫色「体验引导」。** 9 步浮层会依次聚焦导航、聊天、选文探索、返回原句、保留想法、图谱、节点详情与代理执行。可上一步、关闭或随时重开；使用独立的「Weave · 引导演示」对话，不自动运行 CLI。首次访问会显示引导邀请。

引导开始前可选择 **中文 / English**。右上角的语言入口可随时切换，选择保存在当前浏览器。英文版包含完整九步引导、界面文案、英文示例聊天和演示回复；自己输入的聊天与已有节点内容保持原文。两种语言使用各自的示例对话，避免改变原句锚点。

**For reviewers:** select **Take a tour**, choose **English**, and follow the nine-step walkthrough. Explore a passage, return to its source, keep an idea, reveal the map, and inspect the agent panel. The tour uses a separate sample conversation and never starts a CLI task. Switch languages anytime from the top bar; your own messages remain in their original language.

1. 选中 AI 回答中的一句话，点击「旁边问问」。原句会长出连接到右侧探索的细线。
2. 在侧边继续追问。点击「返回原文」收回 thread，并高亮原句；点击「保留想法」可看到它收拢到左侧图谱入口。
3. 点击「看见结构」。对话经过提取、收拢、移动、连线，约 3 秒变成 Idea Map。
4. 顶部中间圆点可进入混合视图：正文旁出现结构批注。点「对话」回到阅读。
5. 点击节点查看摘要和来源；「···」可重命名或添加、折叠分支。「交给代理」才打开任务、日志、记录与验收面板。

左侧 rail 提供新对话、对话历史和结构入口；历史记录按需展开。输入框的「···」中可选择回复来源。直接打开文件时使用预设回答，来源说明位于设置与顶部信息提示中。

## 数据与运行

聊天、探索、保留的想法和图谱均保存在当前浏览器。每段对话有自己的图谱快照；切换与重新生成结构会保留已有节点编辑和运行字段。旧版独立图谱会保存在本地，并可从历史浮层的「打开既有图谱」访问。清除站点数据会删除本地记录。

真实 Claude 对话和执行仍通过原有 `server.mjs` 桥接：在本目录运行 `node server.mjs`，然后打开 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。本机需要已安装并登录 Claude Code，用户主动选择真实模式后才调用。图谱的自动提取沿用本地文字线索规则，节点标题和关系不代表模型的语义判断。

## 源文件

- `index.html`：网页入口。
- `weave-studio.css`：统一的视觉 tokens、rail、正文、空间图谱、二级面板与响应式布局。
- `weave-focus.css`：原句锚点、浮动 thread 与连接线样式。
- `weave-tour.js`、`weave-tour.css`：紫色步骤引导、按钮说明、示例操作与聚焦浮层。
- `weave-i18n.js`：中英文界面字典、语言选择器及英文演示内容。静态部署时必须一并上传。
- `weave-studio.js`：视图协调、Hybrid、共享元素动画、保留反馈和二级面板。
- `weave-focus.js`：探索数据、原句位置、独立追问与返回。
- `weave-chat.js`、`chat-import.js`：原有聊天存储、回复与候选提取。
- `weave-v2.js`：原有图谱、缩放折叠和执行逻辑；节点表现已简化。
- `weave-v2.css`、`weave-luxe.css`、`weave-chat.css`：旧版样式留档，当前入口不再加载。

重构使用原生 CSS、SVG、Web Animations API 和 requestAnimationFrame，没有引入框架。减少动态效果设置下使用短暂淡入与位移。桌面以 1440–1600px 为主，1100px 以下 thread 采用浮层，800px 以下 rail 收拢。
