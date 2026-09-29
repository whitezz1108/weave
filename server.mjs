import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = dirname(fileURLToPath(import.meta.url));
const host = '127.0.0.1';
const port = Number(process.env.WEAVE_PORT || 4173);
const executable = process.platform === 'win32'
  ? join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
  : join(process.env.HOME || '', '.local', 'bin', 'claude');
const tasks = new Map();
const chatSessions = new Map();
let activeChats = 0;
const MAX_CHAT_SESSIONS = 40;
const MAX_TASKS = 20;
const MAX_EVENTS = 500;
const MAX_OUTPUT = 30000;
const MAX_BODY = 65536;

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function error(res, status, message) {
  json(res, status, { error: message });
}

function snapshot(task) {
  return {
    id: task.id,
    nodeId: task.nodeId,
    title: task.title,
    status: task.status,
    model: task.model,
    permissionMode: task.permissionMode,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    exitCode: task.exitCode,
    sessionId: task.sessionId,
    result: task.result || null,
    resultIsError: !!task.resultIsError,
    output: task.output,
    checkpoints: task.checkpoints,
    acceptance: task.acceptance,
  };
}

function addEvent(task, type, text) {
  if (!text) return;
  const line = String(text).slice(0, 4000);
  task.seq += 1;
  task.events.push({ seq: task.seq, at: new Date().toISOString(), type, text: line });
  if (task.events.length > MAX_EVENTS) task.events.shift();
  if (type === 'stdout' || type === 'stderr') task.output = (task.output + line).slice(-MAX_OUTPUT);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) {
      reject({ status: 415, message: 'Send application/json.' });
      return;
    }
    let size = 0;
    let body = '';
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY) {
        tooLarge = true;
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) return reject({ status: 413, message: 'Request body too large.' });
      try { resolve(JSON.parse(body)); }
      catch { reject({ status: 400, message: 'Invalid JSON.' }); }
    });
    req.on('error', reject);
  });
}

function streamClaude(task, stream, type) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    if (type === 'stderr') {
      addEvent(task, 'stderr', chunk);
      return;
    }
    pending += chunk;
    let newline;
    while ((newline = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      if (line) parseClaudeLine(task, line);
    }
    if (pending.length > 65536) {
      addEvent(task, 'stdout', pending.slice(0, 4000));
      pending = '';
    }
  });
  stream.on('end', () => {
    if (pending.trim()) {
      if (type === 'stdout') parseClaudeLine(task, pending.trim());
      else addEvent(task, 'stderr', pending.trim());
    }
  });
}

function parseClaudeLine(task, line) {
  let value;
  try { value = JSON.parse(line); }
  catch {
    addEvent(task, 'stdout', line + '\n');
    return;
  }
  if (typeof value.session_id === 'string') task.sessionId = value.session_id;
  if (value.type === 'stream_event' && value.event?.delta?.type === 'text_delta') {
    addEvent(task, 'stdout', value.event.delta.text);
  } else if (value.type === 'assistant' && Array.isArray(value.message?.content)) {
    for (const block of value.message.content) {
      if (block.type === 'tool_use') addEvent(task, 'status', `Tool: ${block.name}`);
    }
  } else if (value.type === 'result') {
    task.resultIsError = !!value.is_error;
    if (value.is_error) addEvent(task, 'stderr', value.result || 'Claude reported an error.');
    else if (!task.output && value.result) addEvent(task, 'stdout', value.result);
    addEvent(task, 'status', value.is_error ? 'Claude reported a failed result.' : 'Claude returned a result.');
    task.result = value.result || null;
  } else if (value.type === 'system' && value.subtype === 'permission_denied') {
    addEvent(task, 'status', 'A tool permission was denied.');
  }
}

function startTask(input) {
  const task = {
    id: randomUUID(),
    nodeId: input.nodeId || null,
    title: input.title || input.prompt.trim().slice(0, 60),
    status: 'running',
    model: input.model || 'sonnet',
    permissionMode: input.permissionMode || 'plan',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    sessionId: null,
    result: null,
    resultIsError: false,
    output: '',
    events: [],
    seq: 0,
    checkpoints: [],
    acceptance: null,
    process: null,
    cancelRequested: false,
  };
  tasks.set(task.id, task);
  const args = [
    '-p', input.prompt.trim(),
    '--output-format', 'stream-json',
    '--verbose', '--include-partial-messages',
    '--model', task.model,
    '--permission-mode', task.permissionMode,
    '--max-turns', '12',
  ];
  // Only a fixed, installed Claude executable is launched. User text is an argv item, never shell code.
  const child = spawn(executable, args, {
    cwd: projectDir,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  task.process = child;
  addEvent(task, 'status', 'Claude Code process started.');
  streamClaude(task, child.stdout, 'stdout');
  streamClaude(task, child.stderr, 'stderr');
  child.on('error', err => {
    addEvent(task, 'stderr', `Could not start Claude Code: ${err.message}`);
    task.status = 'failed';
    task.finishedAt = new Date().toISOString();
    task.process = null;
  });
  child.on('close', code => {
    if (task.finishedAt) return;
    task.exitCode = code;
    task.status = task.cancelRequested ? 'cancelled' : code === 0 && !task.resultIsError ? 'completed' : 'failed';
    task.finishedAt = new Date().toISOString();
    task.process = null;
    addEvent(task, 'status', `Process ${task.status}; exit code ${code ?? 'unknown'}.`);
  });
  return task;
}

function chatError(res, status, message) {
  json(res, status, { status: 'error', error: message });
}

function runChat(message, model, claudeSessionId, res) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', message,
      '--output-format', 'json',
      '--model', model,
      '--safe-mode',
      '--tools', '',
      '--disallowedTools', 'mcp__*',
      '--permission-mode', 'dontAsk',
      '--permission-prompts', 'none',
      '--max-turns', '1',
    ];
    if (claudeSessionId) args.push('--resume', claudeSessionId);
    const child = spawn(executable, args, {
      cwd: projectDir,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;
    let overflow = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 180000);
    const onResponseClose = () => {
      if (!finished && !res.writableEnded) child.kill();
    };
    res.once('close', onResponseClose);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 1000000) {
        overflow = true;
        child.kill();
      }
    });
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk).slice(-12000);
    });
    child.on('error', err => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      res.off('close', onResponseClose);
      reject({ status: 502, message: `Could not start Claude Code: ${err.message}` });
    });
    child.on('close', code => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      res.off('close', onResponseClose);
      if (timedOut) return reject({ status: 504, message: 'Claude Code took longer than three minutes.' });
      if (overflow) return reject({ status: 502, message: 'Claude Code returned too much data.' });
      let data;
      try { data = JSON.parse(stdout.trim()); }
      catch {
        return reject({ status: 502, message: stderr.trim() || 'Claude Code did not return valid JSON.' });
      }
      if (code !== 0 || data.is_error || typeof data.result !== 'string') {
        return reject({ status: 502, message: data.result || stderr.trim() || `Claude Code exited with code ${code ?? 'unknown'}.` });
      }
      if (typeof data.session_id !== 'string' || !/^[a-zA-Z0-9-]{8,120}$/.test(data.session_id)) {
        return reject({ status: 502, message: 'Claude Code did not return a usable session ID.' });
      }
      resolve({ reply: data.result, claudeSessionId: data.session_id });
    });
  });
}

function requireLocalWrite(req, res) {
  const origin = req.headers.origin;
  if ((origin && origin !== `http://${host}:${port}`) || req.headers['x-weave-client'] !== '1') {
    error(res, 403, 'Use the local Weave page to control tasks.');
    return false;
  }
  return true;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  const pathname = url.pathname;
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const page = readFileSync(join(projectDir, 'index.html'));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': page.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(page);
    return;
  }
  const staticFiles = {
    '/weave-studio.css': { filename: 'weave-studio.css', type: 'text/css; charset=utf-8' },
    '/weave-studio.js': { filename: 'weave-studio.js', type: 'text/javascript; charset=utf-8' },
    '/weave-focus.css': { filename: 'weave-focus.css', type: 'text/css; charset=utf-8' },
    '/weave-focus.js': { filename: 'weave-focus.js', type: 'text/javascript; charset=utf-8' },
    '/weave-dispatch.js': { filename: 'weave-dispatch.js', type: 'text/javascript; charset=utf-8' },
    '/weave-export.js': { filename: 'weave-export.js', type: 'text/javascript; charset=utf-8' },
    '/weave-tour.css': { filename: 'weave-tour.css', type: 'text/css; charset=utf-8' },
    '/weave-tour.js': { filename: 'weave-tour.js', type: 'text/javascript; charset=utf-8' },
    '/weave-i18n.js': { filename: 'weave-i18n.js', type: 'text/javascript; charset=utf-8' },
    '/weave-v2.css': { filename: 'weave-v2.css', type: 'text/css; charset=utf-8' },
    '/weave-luxe.css': { filename: 'weave-luxe.css', type: 'text/css; charset=utf-8' },
    '/weave-v2.js': { filename: 'weave-v2.js', type: 'text/javascript; charset=utf-8' },
    '/chat-import.js': { filename: 'chat-import.js', type: 'text/javascript; charset=utf-8' },
    '/weave-chat.js': { filename: 'weave-chat.js', type: 'text/javascript; charset=utf-8' },
    '/weave-chat.css': { filename: 'weave-chat.css', type: 'text/css; charset=utf-8' },
    '/weave-bg.css': { filename: 'weave-bg.css', type: 'text/css; charset=utf-8' },
    '/weave-bg.js': { filename: 'weave-bg.js', type: 'text/javascript; charset=utf-8' },
    '/assets/weave-bg.png': { filename: join('assets', 'weave-bg.png'), type: 'image/png' },
  };
  if (req.method === 'GET' && Object.hasOwn(staticFiles, pathname)) {
    const asset = staticFiles[pathname];
    try {
      const body = readFileSync(join(projectDir, asset.filename));
      res.writeHead(200, {
        'Content-Type': asset.type,
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    } catch {
      error(res, 404, 'Asset not found.');
    }
    return;
  }
  if (req.method === 'GET' && pathname === '/api/health') {
    const available = existsSync(executable);
    json(res, 200, { ok: true, mode: 'connected', provider: { id: 'claude', label: 'Claude Code', available } });
    return;
  }
  if (req.method === 'POST' && pathname === '/api/chat') {
    if (!requireLocalWrite(req, res)) return;
    if (!existsSync(executable)) return chatError(res, 503, 'Claude Code is not installed.');
    let session;
    let isNew = false;
    try {
      const input = await readJson(req);
      if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 8000) {
        return chatError(res, 400, 'Message must be 1 to 8000 characters.');
      }
      if (input.model != null && !['sonnet', 'opus', 'haiku'].includes(input.model)) {
        return chatError(res, 400, 'Unsupported model.');
      }
      if (input.sessionId != null && (typeof input.sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.sessionId))) {
        return chatError(res, 400, 'Invalid session ID.');
      }
      if (input.sessionId) {
        session = chatSessions.get(input.sessionId);
        if (!session) return chatError(res, 404, 'Chat session was not found on this local server.');
      } else {
        isNew = true;
        if (chatSessions.size >= MAX_CHAT_SESSIONS) {
          const oldest = [...chatSessions.values()].find(item => !item.busy);
          if (oldest) chatSessions.delete(oldest.id);
        }
        session = { id: randomUUID(), claudeSessionId: null, model: 'sonnet', busy: false };
        chatSessions.set(session.id, session);
      }
      if (activeChats >= 1 || session.busy) {
        if (isNew) chatSessions.delete(session.id);
        return chatError(res, 409, 'Another chat message is in progress.');
      }
      const model = input.model || session.model;
      session.busy = true;
      activeChats += 1;
      try {
        const result = await runChat(input.message.trim(), model, session.claudeSessionId, res);
        session.claudeSessionId = result.claudeSessionId;
        session.model = model;
        if (!res.destroyed) json(res, 200, {
          status: 'completed', reply: result.reply, sessionId: session.id, model,
        });
      } catch (err) {
        if (isNew) chatSessions.delete(session.id);
        if (!res.destroyed) chatError(res, err.status || 502, err.message || 'Claude Code failed.');
      } finally {
        session.busy = false;
        activeChats -= 1;
      }
    } catch (err) {
      if (!res.destroyed && !res.writableEnded) chatError(res, err.status || 400, err.message || 'Could not read request.');
    }
    return;
  }
  if (req.method === 'GET' && pathname === '/api/tasks') {
    json(res, 200, { tasks: [...tasks.values()].map(snapshot).reverse() });
    return;
  }
  if (req.method === 'POST' && pathname === '/api/tasks') {
    if (!requireLocalWrite(req, res)) return;
    if (!existsSync(executable)) return error(res, 503, 'Claude Code native executable was not found.');
    if ([...tasks.values()].some(task => task.status === 'running')) return error(res, 409, 'One task is already running.');
    try {
      const input = await readJson(req);
      if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 8000) return error(res, 400, 'Prompt must be 1 to 8000 characters.');
      if (input.nodeId != null && (typeof input.nodeId !== 'string' || input.nodeId.length > 120)) return error(res, 400, 'Invalid nodeId.');
      if (input.title != null && (typeof input.title !== 'string' || input.title.length > 120)) return error(res, 400, 'Invalid title.');
      if (input.model != null && !['sonnet', 'opus', 'haiku'].includes(input.model)) return error(res, 400, 'Unsupported model.');
      if (input.permissionMode != null && !['plan', 'default'].includes(input.permissionMode)) return error(res, 400, 'Unsupported permission mode.');
      if (tasks.size >= MAX_TASKS) {
        const oldestFinished = [...tasks.values()].find(task => task.status !== 'running');
        if (oldestFinished) tasks.delete(oldestFinished.id);
      }
      json(res, 201, { task: snapshot(startTask(input)) });
    } catch (err) {
      if (!res.writableEnded) error(res, err.status || 400, err.message || 'Could not read request.');
    }
    return;
  }
  const match = pathname.match(/^\/api\/tasks\/([0-9a-f-]+)(?:\/(events|checkpoints|accept|cancel))?$/);
  if (match) {
    const task = tasks.get(match[1]);
    if (!task) return error(res, 404, 'Task not found.');
    const action = match[2];
    if (req.method === 'GET' && !action) return json(res, 200, { task: snapshot(task) });
    if (req.method === 'GET' && action === 'events') {
      const after = Number(url.searchParams.get('after') || 0);
      if (!Number.isSafeInteger(after) || after < 0) return error(res, 400, 'Invalid event cursor.');
      return json(res, 200, { events: task.events.filter(event => event.seq > after), nextSeq: task.seq });
    }
    if (req.method === 'GET' && action === 'checkpoints') return json(res, 200, { checkpoints: task.checkpoints });
    if (req.method === 'POST' && action === 'cancel') {
      if (!requireLocalWrite(req, res)) return;
      if (task.status !== 'running') return error(res, 409, 'Task is not running.');
      task.cancelRequested = true;
      task.process?.kill();
      addEvent(task, 'status', 'Cancellation requested.');
      return json(res, 200, { task: snapshot(task) });
    }
    if (req.method === 'POST' && action === 'checkpoints') {
      if (!requireLocalWrite(req, res)) return;
      try {
        const input = await readJson(req);
        if (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 100) return error(res, 400, 'Invalid checkpoint label.');
        if (input.note != null && (typeof input.note !== 'string' || input.note.length > 2000)) return error(res, 400, 'Invalid checkpoint note.');
        const checkpoint = {
          id: randomUUID(), label: input.label.trim(), note: input.note || '',
          at: new Date().toISOString(), status: task.status,
          exitCode: task.exitCode, sessionId: task.sessionId,
          outputTail: task.output.slice(-4000),
        };
        task.checkpoints.push(checkpoint);
        return json(res, 201, { checkpoint });
      } catch (err) {
        if (!res.writableEnded) return error(res, err.status || 400, err.message || 'Could not read request.');
      }
      return;
    }
    if (req.method === 'POST' && action === 'accept') {
      if (!requireLocalWrite(req, res)) return;
      if (task.status === 'running') return error(res, 409, 'Wait for the task to finish before acceptance.');
      try {
        const input = await readJson(req);
        if (!['pass', 'needs-work'].includes(input.verdict)) return error(res, 400, 'Invalid verdict.');
        if (input.note != null && (typeof input.note !== 'string' || input.note.length > 2000)) return error(res, 400, 'Invalid acceptance note.');
        task.acceptance = {
          verdict: input.verdict, note: input.note || '', at: new Date().toISOString(),
          exitCode: task.exitCode, sessionId: task.sessionId,
        };
        return json(res, 200, { acceptance: task.acceptance });
      } catch (err) {
        if (!res.writableEnded) return error(res, err.status || 400, err.message || 'Could not read request.');
      }
      return;
    }
  }
  error(res, 404, 'Route not found.');
});

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('WEAVE_PORT must be between 1024 and 65535.');
}
server.listen(port, host, () => {
  console.log(`Weave local board: http://${host}:${port}`);
  console.log(`Claude Code: ${existsSync(executable) ? 'detected' : 'not found'}`);
});
