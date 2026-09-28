/* Turn a local chat history into editable idea-map candidates.
   This module uses visible text cues only. It does not infer meaning with an AI model. */
(function (global) {
  'use strict';

  const MAX_TEXT = 2000000;
  const MAX_TITLE = 44;
  const DEFAULT_MAX_NODES = 90;
  const SIDE_CUE = /^(?:另外|还有(?:一个)?问题|顺便|题外话|岔开(?:一下)?|延伸(?:一下)?|换个角度|by the way|side question|another question|what if)/i;
  const FOLLOW_CUE = /^(?:继续|接着|基于(?:刚才|这个|上面)|那么|那(?:么)?如果|进一步|展开(?:说说)?|回到(?:刚才|这个)|follow.?up|continuing|based on (?:that|this)|then)/i;
  const RETURN_CUE = /^(?:回到主线|回到最初|回到主题|先不说这个|back to the main|back to the original)/i;
  const TASK_CUE = /(?:下一步|待办|行动项|落实|实现|做一个|制作|开发|执行|验证|测试|交付|next step|to.?do|action item|implement|build|test|deliver)/i;
  const DECISION_CUE = /(?:我决定|就按|最终选择|定为|采用这个|结论是|we decided|let.?s go with|decision:)/i;
  const QUESTION_CUE = /[?？]|(?:^|\s)(?:what|why|how|whether|can we|should we)\b|^(?:如何|为什么|怎样|能否|是否)/i;

  function clean(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function compact(value) {
    return clean(value).replace(/\s+/g, ' ');
  }

  function excerpt(value, limit) {
    const text = compact(value);
    return text.length > limit ? text.slice(0, limit - 1).trimEnd() + '…' : text;
  }

  function titleFrom(value) {
    const source = clean(value);
    const heading = source.match(/^\s*#{1,6}\s+(.+)$/m);
    const first = heading ? heading[1] : source.split(/\n\s*\n|\n|[。！？!?]/)[0];
    const stripped = compact(first).replace(/^[-*•]\s+|^\d+[.)、]\s+/, '').replace(/^#{1,6}\s*/, '');
    return excerpt(stripped || source, MAX_TITLE) || '未命名想法';
  }

  function roleOf(value) {
    const role = clean(value).toLowerCase();
    if (/^(user|human|you|me|用户|提问者|我)$/.test(role)) return 'user';
    if (/^(assistant|ai|chatgpt|claude|助手|ai助手|机器人)$/.test(role)) return 'assistant';
    if (role === 'unknown') return 'unknown';
    return null;
  }

  function contentOf(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item.text === 'string') return item.text;
      if (item && typeof item.content === 'string') return item.content;
      return '';
    }).filter(Boolean).join('\n');
    return '';
  }

  function normalizeMessages(input) {
    const supplied = Array.isArray(input) ? input : input && Array.isArray(input.turns) ? input.turns : input && Array.isArray(input.messages) ? input.messages : [];
    const messages = [];
    const warnings = [];
    let ignored = 0;
    supplied.forEach((item, originalIndex) => {
      if (!item || typeof item !== 'object') { ignored++; return; }
      const role = roleOf(item.role) || roleOf(item.speaker);
      if (!role) { ignored++; return; }
      const content = clean(contentOf(item.content == null ? item.text : item.content));
      if (!content) { ignored++; return; }
      messages.push({
        id: item.id == null ? 'message-' + originalIndex : String(item.id),
        role,
        content,
        originalIndex,
        sourceLine: item.sourceLine == null ? null : item.sourceLine
      });
    });
    if (ignored) warnings.push('已跳过 ' + ignored + ' 条空消息或非聊天角色消息。');
    return { messages, warnings };
  }

  function parse(text) {
    const warnings = [];
    let input = clean(text);
    if (!input) return { turns: [], warnings: ['聊天文本为空。'], format: 'empty' };
    if (input.length > MAX_TEXT) {
      input = input.slice(0, MAX_TEXT);
      warnings.push('文本超过 200 万字符，只解析了前半部分。');
    }
    const lines = input.split('\n');
    const turns = [];
    let current = null;
    let fenced = false;
    let preamble = [];
    function pushCurrent() {
      if (!current) return;
      current.content = clean(current.lines.join('\n'));
      delete current.lines;
      if (current.content) turns.push(current);
      current = null;
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) fenced = !fenced;
      const marker = fenced ? null : line.match(/^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(User|Human|You|Me|Assistant|AI|ChatGPT|Claude|用户|提问者|我|助手|AI助手)(?:\s+said)?\s*(?:\*\*\s*[:：]|[:：]\s*\*\*|[:：])\s*(.*)$/i);
      const standalone = !marker && !fenced ? line.match(/^\s*(?:#{1,6}\s+|\*\*)\s*(User|Human|You|Me|Assistant|AI|ChatGPT|Claude|用户|提问者|我|助手|AI助手)\s*(?:\*\*)?\s*$/i) : null;
      const match = marker || standalone;
      if (match) {
        if (preamble.length) {
          const before = clean(preamble.join('\n'));
          if (before) turns.push({ id: 'turn-' + turns.length, role: 'unknown', content: before, sourceLine: 1 });
          preamble = [];
        }
        pushCurrent();
        current = { id: 'turn-' + turns.length, role: roleOf(match[1]), sourceLine: i + 1, lines: marker && marker[2] ? [marker[2]] : [] };
      } else if (current) current.lines.push(line);
      else preamble.push(line);
    }
    pushCurrent();
    if (turns.length) {
      const unknownCount = turns.filter(t => t.role === 'unknown').length;
      if (unknownCount) warnings.push('开头有 ' + unknownCount + ' 段未标注说话者，已保留为未知角色。');
      return { turns, warnings, format: 'role-labelled' };
    }
    const paragraphs = input.split(/\n\s*\n+/).map(clean).filter(Boolean);
    paragraphs.forEach((paragraph, i) => turns.push({ id: 'turn-' + i, role: 'unknown', content: paragraph, sourceLine: null }));
    warnings.push('未识别到说话者标签；按段落保留文本，角色标记为未知。');
    return { turns, warnings, format: 'paragraphs' };
  }

  function classify(text) {
    const compactText = compact(text);
    if (DECISION_CUE.test(compactText)) return { kind: 'DECISION', reason: '出现明确的决定或选择提示词' };
    if (TASK_CUE.test(compactText)) return { kind: 'ACTION', reason: '出现下一步或执行提示词' };
    if (QUESTION_CUE.test(compactText)) return { kind: 'QUESTION', reason: '出现问句或问号' };
    return { kind: 'IDEA', reason: '聊天中出现一条新的用户想法' };
  }

  function explicitBullets(text) {
    const lines = clean(text).split('\n');
    const bullets = lines.map(line => line.match(/^\s*(?:[-*•]\s+|\d+[.)、]\s+)(.{8,})$/)).filter(Boolean).map(m => clean(m[1]));
    return bullets.length >= 2 ? bullets.slice(0, 5) : [];
  }

  function explicitHeadings(text) {
    const headings = clean(text).split('\n').map(line => line.match(/^\s*#{2,4}\s+(.{3,80})\s*$/)).filter(Boolean).map(m => clean(m[1]));
    return headings.length >= 2 ? headings.slice(0, 4) : [];
  }

  function structure(input, options) {
    const config = options && typeof options === 'object' ? options : {};
    const maxNodes = Math.max(10, Math.min(200, Number(config.maxNodes) || DEFAULT_MAX_NODES));
    const normalized = normalizeMessages(input);
    const messages = normalized.messages;
    const warnings = normalized.warnings.slice();
    const nodes = [];
    const stats = { messages: messages.length, userMessages: 0, assistantMessages: 0, candidates: 0 };
    if (!messages.length) return { nodes, warnings: warnings.concat('没有可整理的聊天消息。'), stats, method: 'explicit-text-cues' };

    const firstIdea = messages.find(message => message.role !== 'assistant') || messages[0];
    const firstTitle = clean(config.rootTitle) || titleFrom(firstIdea.content);
    const root = {
      id: 'idea-root', parent: null, title: excerpt(firstTitle, MAX_TITLE), kind: 'TOPIC',
      summary: excerpt(firstIdea.content, 170), prompt: firstIdea.content,
      sourceIds: [firstIdea.id], sourceIndexes: [firstIdea.originalIndex],
      responsePreview: '', reason: '以第一条用户消息作为主话题', included: true
    };
    nodes.push(root);
    let counter = 1;
    let lastNode = root;

    let currentReplyNode = root;
    let truncated = false;

    function addCandidate(parent, text, kind, reason, source) {
      if (nodes.length >= maxNodes) { truncated = true; return null; }
      const candidate = {
        id: 'idea-' + counter++, parent: parent.id, title: titleFrom(text), kind,
        summary: excerpt(text, 170), prompt: text,
        sourceIds: [source.id], sourceIndexes: [source.originalIndex],
        responsePreview: '', reason, included: true
      };
      nodes.push(candidate);
      return candidate;
    }

    for (const message of messages) {
      if (message.role === 'assistant') {
        stats.assistantMessages++;
        const target = currentReplyNode;
        if (target && !target.sourceIds.includes(message.id)) {
          target.sourceIds.push(message.id);
          target.sourceIndexes.push(message.originalIndex);
          if (!target.responsePreview) target.responsePreview = excerpt(message.content, 180);
        }
        const headings = explicitHeadings(message.content);
        for (const heading of headings) addCandidate(target || root, heading, 'SECTION', 'AI 回复中的显式 Markdown 小标题', message);
        continue;
      }
      if (message.role === 'user') stats.userMessages++;
      if (message === firstIdea) {
        currentReplyNode = root;
        for (const bullet of explicitBullets(message.content)) addCandidate(root, bullet, classify(bullet).kind, '首条消息中的显式列表项', message);
        continue;
      }
      const text = compact(message.content);
      const side = SIDE_CUE.test(text);
      const follow = FOLLOW_CUE.test(text);
      const returned = RETURN_CUE.test(text);
      const parent = returned ? root : side || follow ? lastNode : root;
      const type = classify(message.content);
      const kind = side ? 'BRANCH' : type.kind;
      const reason = returned ? '出现返回主线提示词' : side ? '出现侧问题提示词' : follow ? '出现继续追问提示词' : type.reason;
      const node = addCandidate(parent, message.content, kind, reason, message);
      if (node) {
        lastNode = node;

        currentReplyNode = node;
        for (const bullet of explicitBullets(message.content)) addCandidate(node, bullet, classify(bullet).kind, '消息中的显式列表项', message);
      }
    }
    if (truncated) warnings.push('候选节点达到 ' + maxNodes + ' 个上限；可分段整理其余聊天内容。');
    if (messages.some(message => message.role === 'unknown')) warnings.push('部分消息没有角色标签；这些段落按用户想法生成候选，请在预览中检查。');
    stats.candidates = nodes.length;
    stats.sideBranches = nodes.filter(node => node.kind === 'BRANCH').length;
    stats.explicitSections = nodes.filter(node => node.kind === 'SECTION').length;
    return { nodes, warnings, stats, method: 'explicit-text-cues' };
  }

  function sampleMessages() {
    if(global.WeaveI18n?.language==='en')return global.WeaveI18n.sampleMessages();
    return [
      { id: 's1', role: 'user', content: '我想设计一个面向重度 AI 用户的产品：长对话里能保留主线，也能随时探索侧问题。' },
      { id: 's2', role: 'assistant', content: '先看一个真实的使用场景。你正在和 AI 用半小时梳理一份产品方案：开头定义用户，中间讨论三个交互方向，后面又追问商业模式。到第 40 轮时，最初那个好点子还在聊天记录里，却已经很难找回。\n\n更麻烦的是，你读到某个回答里的“上下文污染（context contamination）”时，想先问清楚这个概念。直接在主聊天里追问，会把当前讨论带离产品方案；如果另开一个聊天，又失去这句话的来龙去脉。\n\n所以第一步不是让用户管理复杂的图谱，而是允许他选中这一句，在旁边短暂探索。理解后能回到刚才阅读的准确位置，主线继续。只有真正值得留下的发现，才被保留为想法，逐渐连成图谱。' },
      { id: 's3', role: 'user', content: '为什么普通线性聊天会让人忘记之前的重要想法？' },
      { id: 's4', role: 'assistant', content: '因为新问题不断堆在底部，旧想法需要大量滚动才能找到。' },
      { id: 's5', role: 'user', content: '如果我读到一半突然想问一个小问题，怎样才能不丢掉刚才的阅读位置？' },
      { id: 's6', role: 'assistant', content: '让侧问题从原文中的一个词句直接长出来。你可以在旁边追问几轮；关掉侧边探索时，页面回到那句原文，并标记这处已经探索过。主聊天不需要插入一串岔开的问答。' },
      { id: 's7', role: 'user', content: '那每个侧问题都要放到图谱里吗？' },
      { id: 's8', role: 'assistant', content: '不用。多数侧问题只是在帮助理解，问完就可以收起。只有你觉得值得继续发展或以后再找回的发现，才主动保留为一个想法。' },
      { id: 's9', role: 'user', content: '回到主线，我想让第一版重点呈现“从原句出发、探索、准确返回、保留想法”这条路径。' },
      { id: 's10', role: 'assistant', content: '这条路径应该成为演示的主角。图谱是留下来的想法自然连接后的结果，可以从节点回到它的来源。' }
    ];
  }

  function sample() {
    return sampleMessages().map(message => (message.role === 'user' ? 'User' : 'Assistant') + ': ' + message.content).join('\n\n');
  }

  const api = { parse, structure, sampleMessages, sample };
  global.WeaveImport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
