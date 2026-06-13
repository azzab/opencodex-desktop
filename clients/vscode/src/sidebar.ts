/**
 * Webview sidebar provider — thin bridge between VS Code and Kun protocol.
 */
import * as vscode from 'vscode'
import { OpenCodexVsCodeClient } from './client.js'
import { filterThreadsForWorkspace, workspaceLabel } from './workspace.js'

/**
 * Parse a raw SSE chunk into a flat event record for the webview.
 * Handles real Kun event shapes:
 *   assistant_text_delta / assistant_reasoning_delta → item.text
 *   tool_call_ready → toolName
 *   approval_requested / approval_resolved → approvalId, summary, status
 *   turn_completed / turn_failed / turn_aborted → status, message
 *   error → message
 */
export function parseSseEvent(raw: string): Record<string, unknown> | null {
  const lines = raw.split('\n')
  let data = ''
  let eventType = ''
  for (const line of lines) {
    if (line.startsWith('event:')) eventType = line.slice(6).trim()
    else if (line.startsWith('data:')) data = line.slice(5).trim()
  }
  if (!data) return null
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>
    const item = parsed.item as Record<string, unknown> | undefined
    const eventKind = eventType || (parsed.kind as string) || (parsed.type as string) || 'message'

    // text: real Kun events carry it at parsed.item.text for assistant_text_delta / assistant_reasoning_delta
    const text = item?.text ?? parsed.text ?? parsed.delta
    const reasoningText = eventKind === 'assistant_reasoning_delta' ? (item?.text ?? parsed.text ?? '') : null

    const result: Record<string, unknown> = {
      event: eventKind,
      kind: parsed.kind ?? parsed.type,
      status: parsed.status,
      name: parsed.name ?? parsed.toolName,
      toolName: parsed.toolName ?? parsed.name,
      approvalId: parsed.approvalId ?? parsed.id,
      summary: parsed.summary,
      message: parsed.message,
      threadId: parsed.threadId,
      turnId: parsed.turnId
    }
    if (text !== undefined && text !== null) result.text = text
    if (reasoningText) result.reasoningText = reasoningText
    return result
  } catch {
    return { event: eventType || 'message', text: data.slice(0, 500) }
  }
}

export class OpenCodexSidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView
  private client: OpenCodexVsCodeClient | null = null
  private activeStreamAbort: AbortController | null = null

  constructor(
    private readonly getClient: () => OpenCodexVsCodeClient | null,
    private readonly getWorkspaceRoot: () => string
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: []
    }
    webviewView.webview.html = this.getHtmlContent()
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      await this.handleMessage(msg)
    })
  }

  refresh(): void {
    this.postWorkspace()
    const client = this.getClient()
    if (client) {
      void this.refreshThreads(client)
      void this.refreshApprovals(client)
    }
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    const client = this.getClient()
    if (!client && msg.command !== 'ready') {
      this.post({ command: 'error', message: 'Server not connected. Check OpenCodex settings.' })
      return
    }

    switch (msg.command) {
      case 'ready':
        this.postWorkspace()
        if (client) {
          this.refreshThreads(client)
          this.refreshApprovals(client)
        }
        break

      case 'selectThread': {
        const threadId = String(msg.threadId ?? '')
        if (client) {
          await this.loadThread(client, threadId)
        }
        break
      }

      case 'createThread': {
        if (client) {
          await this.createThread(client)
        }
        break
      }

      case 'sendTurn': {
        const threadId = String(msg.threadId ?? '')
        const prompt = String(msg.prompt ?? '')
        if (client) {
          await this.sendTurn(client, threadId, prompt)
        }
        break
      }

      case 'respondApproval': {
        const approvalId = String(msg.approvalId ?? '')
        const action = String(msg.action ?? 'allow')
        if (client) {
          await this.respondApproval(client, approvalId, action as 'allow' | 'deny')
        }
        break
      }
    }
  }

  private async refreshThreads(client: OpenCodexVsCodeClient): Promise<void> {
    const result = await client.listThreads()
    if (result.ok) {
      const workspaceRoot = this.getWorkspaceRoot()
      this.post({
        command: 'threads',
        threads: filterThreadsForWorkspace(result.value, workspaceRoot),
        workspaceRoot,
        workspaceLabel: workspaceLabel(workspaceRoot)
      })
    }
  }

  private async createThread(client: OpenCodexVsCodeClient): Promise<void> {
    const workspaceRoot = this.getWorkspaceRoot()
    if (!workspaceRoot) {
      this.post({ command: 'error', message: 'Open a project folder in VS Code before creating an OpenCodex thread.' })
      return
    }
    const result = await client.createThread({
      workspaceRoot,
      title: workspaceLabel(workspaceRoot),
      model: 'auto',
      mode: 'agent'
    })
    if (!result.ok) {
      this.post({ command: 'error', message: result.message })
      return
    }
    this.post({ command: 'threadCreated', thread: result.value })
    await this.refreshThreads(client)
  }

  private async refreshApprovals(client: OpenCodexVsCodeClient): Promise<void> {
    const result = await client.listApprovals()
    if (result.ok) {
      this.post({ command: 'approvals', approvals: result.value })
    }
  }

  private async loadThread(client: OpenCodexVsCodeClient, threadId: string): Promise<void> {
    const result = await client.getThread(threadId)
    if (result.ok) {
      this.post({ command: 'threadDetail', thread: result.value })
    }
  }

  private async sendTurn(
    client: OpenCodexVsCodeClient,
    threadId: string,
    prompt: string
  ): Promise<void> {
    // Abort any in-flight stream for this thread
    this.activeStreamAbort?.abort()
    this.activeStreamAbort = new AbortController()
    const signal = this.activeStreamAbort.signal

    const result = await client.sendTurn(threadId, prompt)
    if (!result.ok) {
      this.post({ command: 'error', message: result.message })
      return
    }
    // Clear transcript and show turn queued marker
    this.post({
      command: 'transcript',
      threadId,
      items: [{ kind: 'message', text: `Turn ${result.value.id} started` }]
    })

    // Stream SSE events to webview
    const streamResult = await client.streamEvents(threadId)
    if (!streamResult.ok) {
      this.post({ command: 'error', message: `Stream unavailable: ${streamResult.message}` })
      return
    }

    const reader = streamResult.value.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        if (signal.aborted) {
          reader.cancel()
          break
        }
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const trimmed = part.trim()
          if (!trimmed) continue
          const sseEvent = this.parseSse(trimmed)
          if (sseEvent) {
            this.post({ command: 'event', ...sseEvent })
          }
        }
      }
      // Flush final buffer
      if (buffer.trim() && !signal.aborted) {
        const sseEvent = this.parseSse(buffer.trim())
        if (sseEvent) {
          this.post({ command: 'event', ...sseEvent })
        }
      }
    } catch {
      if (!signal.aborted) {
        this.post({ command: 'error', message: 'Stream disconnected' })
      }
    } finally {
      if (this.activeStreamAbort?.signal === signal) {
        this.activeStreamAbort = null
      }
      try { reader.releaseLock() } catch { /* already released */ }
    }

    // Refresh approvals after stream ends (may have new pending approvals)
    this.refreshApprovals(client)
  }

  private parseSse(raw: string): Record<string, unknown> | null {
    return parseSseEvent(raw)
  }

  private async respondApproval(
    client: OpenCodexVsCodeClient,
    approvalId: string,
    action: 'allow' | 'deny'
  ): Promise<void> {
    const result = await client.respondApproval(approvalId, action)
    if (result.ok) {
      this.refreshApprovals(client)
    } else {
      this.post({ command: 'error', message: result.message })
    }
  }

  private post(message: Record<string, unknown>): void {
    this._view?.webview.postMessage(message)
  }

  private postWorkspace(): void {
    const workspaceRoot = this.getWorkspaceRoot()
    this.post({
      command: 'workspace',
      workspaceRoot,
      workspaceLabel: workspaceLabel(workspaceRoot)
    })
  }

  private getHtmlContent(): string {
    // Inline the sidebar HTML (copied at build time via esbuild or direct read)
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>OpenCodex Sidebar</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); padding: 8px; }
    .section { margin-bottom: 12px; }
    .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 4px; padding: 4px 0; border-bottom: 1px solid var(--vscode-sideBar-border); }
    .thread-item { padding: 4px 6px; cursor: pointer; border-radius: 3px; }
    .thread-item:hover { background: var(--vscode-list-hoverBackground); }
    .thread-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .thread-title { font-weight: 500; }
    .thread-meta { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .workspace-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .workspace-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .mini-btn { padding: 2px 7px; border: 1px solid var(--vscode-button-border); border-radius: 2px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; font-size: 11px; white-space: nowrap; }
    .mini-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    #transcript { max-height: 300px; overflow-y: auto; padding: 4px; border: 1px solid var(--vscode-sideBar-border); border-radius: 3px; font-size: 12px; }
    .transcript-item { padding: 2px 0; }
    .transcript-item .role { font-weight: 600; color: var(--vscode-textLink-foreground); }
    .transcript-item .text { white-space: pre-wrap; word-break: break-word; }
    .approval-item { padding: 4px 6px; margin-bottom: 4px; border: 1px solid var(--vscode-sideBar-border); border-radius: 3px; font-size: 12px; }
    .approval-item.pending { border-color: var(--vscode-inputValidation-warningBorder); }
    .approval-actions { display: flex; gap: 6px; margin-top: 4px; }
    .approval-actions button { padding: 2px 8px; font-size: 11px; cursor: pointer; border: 1px solid var(--vscode-button-border); border-radius: 2px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .approval-actions button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .approval-actions button.allow { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .approval-actions button.allow:hover { background: var(--vscode-button-hoverBackground); }
    #send-area { display: flex; gap: 4px; margin-top: 8px; }
    #prompt-input { flex: 1; padding: 4px 6px; border: 1px solid var(--vscode-input-border); border-radius: 2px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: inherit; font-size: 12px; }
    #send-btn { padding: 4px 12px; border: none; border-radius: 2px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; font-size: 12px; }
    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
    .error { color: var(--vscode-errorForeground); font-size: 11px; }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 12px; padding: 8px 0; }
  </style>
</head>
<body>
  <div class="section">
    <div class="section-title">Threads</div>
    <div class="workspace-row">
      <div id="workspace-name" class="workspace-name">No folder open</div>
      <button id="new-thread-btn" class="mini-btn" title="New project thread">New</button>
    </div>
    <div id="thread-list"><div class="empty">Loading...</div></div>
  </div>
  <div class="section">
    <div class="section-title">Transcript</div>
    <div id="transcript"><div class="empty">Select a thread</div></div>
  </div>
  <div class="section">
    <div class="section-title">Approvals</div>
    <div id="approval-list"><div class="empty">None</div></div>
  </div>
  <div id="send-area">
    <input id="prompt-input" type="text" placeholder="Type a prompt..." />
    <button id="send-btn">Send</button>
  </div>
  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      let activeThreadId = null;

      function post(cmd, payload) {
        vscode.postMessage(Object.assign({ command: cmd }, payload || {}));
      }

      window.addEventListener('message', function(event) {
        const msg = event.data;
        switch (msg.command) {
          case 'workspace': renderWorkspace(msg); break;
          case 'threads': renderWorkspace(msg); renderThreads(msg.threads); break;
          case 'threadCreated': activeThreadId = msg.thread.id; renderThreadDetail(msg.thread); break;
          case 'threadDetail': renderThreadDetail(msg.thread); break;
          case 'transcript': renderTranscript(msg.threadId, msg.items); break;
          case 'approvals': renderApprovals(msg.approvals); break;
          case 'event': handleEvent(msg); break;
          case 'error': document.getElementById('transcript').innerHTML = '<div class="error">' + esc(msg.message) + '</div>'; break;
        }
      });

      function renderWorkspace(msg) {
        const label = msg.workspaceLabel || 'No folder open';
        const root = msg.workspaceRoot || '';
        document.getElementById('workspace-name').textContent = root ? label : 'No folder open';
        document.getElementById('workspace-name').title = root || 'Open a folder in VS Code';
      }

      function renderThreads(threads) {
        const el = document.getElementById('thread-list');
        if (!threads || threads.length === 0) {
          activeThreadId = null;
          el.innerHTML = '<div class="empty">No threads for this project</div>';
          document.getElementById('transcript').innerHTML = '<div class="empty">Create or select a project thread</div>';
          return;
        }
        if (activeThreadId && !threads.some(function(t) { return t.id === activeThreadId; })) activeThreadId = null;
        el.innerHTML = threads.map(function(t) {
          return '<div class="thread-item' + (t.id === activeThreadId ? ' active' : '') + '" data-id="' + esc(t.id) + '"><div class="thread-title">' + esc(t.title) + '</div><div class="thread-meta">' + t.status + ' \u00b7 ' + t.mode + '</div></div>';
        }).join('');
        el.querySelectorAll('.thread-item').forEach(function(item) {
          item.addEventListener('click', function() {
            activeThreadId = this.getAttribute('data-id');
            post('selectThread', { threadId: activeThreadId });
            renderThreads(threads);
          });
        });
      }

      function renderThreadDetail(thread) {
        document.getElementById('transcript').innerHTML =
          '<div class="transcript-item"><span class="role">Thread: </span><span class="text">' + esc(thread.title) + '</span></div>' +
          '<div class="transcript-item" style="margin-top:4px"><span class="text" style="color:var(--vscode-descriptionForeground)">Workspace: ' + esc(thread.workspaceRoot) + ' | ' + esc(thread.model) + '</span></div>';
      }

      function renderTranscript(threadId, items) {
        const el = document.getElementById('transcript');
        if (!items || items.length === 0) { el.innerHTML = '<div class="empty">No transcript yet</div>'; return; }
        el.innerHTML = items.map(function(i) {
          if (i.kind === 'assistant_text' || i.kind === 'message') return '<div class="transcript-item"><span class="role">Agent: </span><span class="text">' + esc(i.text || i.summary || '') + '</span></div>';
          if (i.kind === 'tool_call') return '<div class="transcript-item"><span class="role">Tool: </span><span class="text">' + esc(i.name || '') + '</span></div>';
          return '<div class="transcript-item"><span class="text">' + esc(JSON.stringify(i)) + '</span></div>';
        }).join('');
      }

      function renderApprovals(approvals) {
        const el = document.getElementById('approval-list');
        if (!approvals || approvals.length === 0) { el.innerHTML = '<div class="empty">None</div>'; return; }
        el.innerHTML = approvals.map(function(a) {
          return '<div class="approval-item ' + a.status + '"><div><strong>' + esc(a.toolName) + '</strong></div><div style="font-size:11px;color:var(--vscode-descriptionForeground)">' + esc(a.summary) + '</div>' +
            (a.status === 'pending'
              ? '<div class="approval-actions"><button class="allow" data-id="' + esc(a.id) + '" data-action="allow">Allow</button><button data-id="' + esc(a.id) + '" data-action="deny">Deny</button></div>'
              : '<div style="font-size:10px;margin-top:2px">' + a.status + '</div>') + '</div>';
        }).join('');
        el.querySelectorAll('.approval-actions button').forEach(function(btn) {
          btn.addEventListener('click', function() {
            post('respondApproval', { approvalId: btn.getAttribute('data-id'), action: btn.getAttribute('data-action') });
          });
        });
      }

      function handleEvent(msg) {
        const el = document.getElementById('transcript');
        const kind = msg.event || msg.kind || '';
        if (kind === 'assistant_text_delta' || kind === 'text') {
          // Streamed text delta — append to current streaming element or create one
          var streaming = el.querySelector('.streaming');
          if (!streaming) {
            streaming = document.createElement('div');
            streaming.className = 'transcript-item streaming';
            streaming.innerHTML = '<span class="role">Agent: </span><span class="text"></span>';
            el.appendChild(streaming);
          }
          streaming.querySelector('.text').textContent += (msg.text || '');
        } else if (kind === 'assistant_reasoning_delta') {
          var r = el.querySelector('.streaming.reasoning');
          if (!r) {
            r = document.createElement('div');
            r.className = 'transcript-item streaming reasoning';
            r.innerHTML = '<span class="role" style="color:var(--vscode-descriptionForeground)">Reasoning: </span><span class="text"></span>';
            el.appendChild(r);
          }
          r.querySelector('.text').textContent += (msg.text || '');
        } else if (kind === 'tool_call_ready' || kind === 'tool_call') {
          var s = el.querySelector('.streaming');
          if (s) s.classList.remove('streaming');
          var div = document.createElement('div');
          div.className = 'transcript-item';
          div.innerHTML = '<span class="role">Tool: </span><span class="text">' + esc(msg.name || msg.toolName || '') + '</span>';
          el.appendChild(div);
        } else if (kind === 'approval_requested' || kind === 'approval_required' || kind === 'approval') {
          var adiv = document.createElement('div');
          adiv.className = 'transcript-item';
          adiv.innerHTML = '<span class="role" style="color:var(--vscode-inputValidation-warningBorder)">Approval: </span><span class="text">' + esc(msg.summary || msg.toolName || '') + '</span>';
          el.appendChild(adiv);
        } else if (kind === 'approval_resolved') {
          var rdiv = document.createElement('div');
          rdiv.className = 'transcript-item';
          rdiv.innerHTML = '<span class="role" style="color:var(--vscode-descriptionForeground)">Approval ' + esc(msg.status || '') + ': </span><span class="text">' + esc(msg.summary || '') + '</span>';
          el.appendChild(rdiv);
        } else if (kind === 'turn_completed' || kind === 'done' || kind === 'completed') {
          var st = el.querySelector('.streaming');
          if (st) st.classList.remove('streaming');
        } else if (kind === 'turn_failed' || kind === 'turn_aborted') {
          var st2 = el.querySelector('.streaming');
          if (st2) st2.classList.remove('streaming');
          var ediv = document.createElement('div');
          ediv.className = 'transcript-item';
          ediv.innerHTML = '<span class="role" style="color:var(--vscode-errorForeground)">' + (kind === 'turn_failed' ? 'Turn Failed' : 'Turn Aborted') + ': </span><span class="text">' + esc(msg.message || '') + '</span>';
          el.appendChild(ediv);
        } else if (kind === 'error') {
          var erdiv = document.createElement('div');
          erdiv.className = 'transcript-item';
          erdiv.innerHTML = '<span class="role" style="color:var(--vscode-errorForeground)">Error: </span><span class="text">' + esc(msg.message || '') + '</span>';
          el.appendChild(erdiv);
        }
        el.scrollTop = el.scrollHeight;
      }

      function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

      document.getElementById('send-btn').addEventListener('click', function() {
        const input = document.getElementById('prompt-input');
        const text = input.value.trim();
        if (!text || !activeThreadId) return;
        post('sendTurn', { threadId: activeThreadId, prompt: text });
        input.value = '';
      });

      document.getElementById('new-thread-btn').addEventListener('click', function() {
        post('createThread', {});
      });

      document.getElementById('prompt-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') document.getElementById('send-btn').click();
      });

      post('ready', {});
    })();
  </script>
</body>
</html>`
  }
}
