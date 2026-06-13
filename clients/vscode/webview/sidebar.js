/* global acquireVsCodeApi */
/* ── OpenCodex Chat Panel Webview Script ── */
(function () {
  var vscode = acquireVsCodeApi()
  var activeThreadId = null
  var activeMode = 'agent'
  var streamingEl = null
  var currentAssistantMsg = null
  var currentToolStep = null
  var workspaceRoot = ''
  var contextChips = []

  function post(cmd, payload) {
    vscode.postMessage(Object.assign({ command: cmd }, payload || {}))
  }

  /* ── message handlers ── */
  window.addEventListener('message', function (ev) {
    var msg = ev.data
    switch (msg.command) {
      case 'workspace': renderWorkspace(msg); break
      case 'threads': renderThreadTabs(msg.threads, msg.workspaceRoot, msg.workspaceLabel); break
      case 'threadCreated': activeThreadId = msg.thread.id; refreshAll(); break
      case 'threadDetail': renderThreadDetail(msg.thread); break
      case 'transcript': renderTranscript(msg.threadId, msg.items); break
      case 'approvals': renderApprovalsInline(msg.approvals); break
      case 'event': handleEvent(msg); break
      case 'contextChips': renderContextChips(msg.chips); break
      case 'error': appendSystemMessage('Error: ' + esc(msg.message), 'error'); break
    }
  })

  /* ── render helpers ── */
  function renderWorkspace(msg) {
    workspaceRoot = msg.workspaceRoot || ''
    var name = msg.workspaceLabel || 'No folder open'
    var el = document.getElementById('workspace-name')
    el.textContent = name
    el.title = workspaceRoot || 'Open a folder in VS Code'
  }

  function renderThreadTabs(threads, wsRoot, wsLabel) {
    var tabs = document.getElementById('thread-tabs')
    if (!threads || threads.length === 0) {
      tabs.innerHTML = ''
      if (!activeThreadId) {
        document.getElementById('chat').innerHTML =
          '<div class="empty-state">No threads for this project — click + to create one</div>'
      }
      return
    }
    tabs.innerHTML = threads
      .map(function (t) {
        var cls = 'tab' + (t.id === activeThreadId ? ' active' : '')
        var label = t.title || 'Thread ' + t.id.slice(0, 7)
        return (
          '<div class="' +
          cls +
          '" data-id="' +
          esc(t.id) +
          '" title="' +
          esc(t.mode) +
          ' \u00b7 ' +
          esc(t.status) +
          '">' +
          esc(label) +
          '</div>'
        )
      })
      .join('')
    tabs.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var id = this.getAttribute('data-id')
        activeThreadId = id
        post('selectThread', { threadId: id })
        renderThreadTabs(threads, wsRoot, wsLabel)
        updateSendBtn()
      })
    })
    updateSendBtn()
  }

  function renderThreadDetail(thread) {
    appendSystemMessage('Thread: ' + esc(thread.title) + ' (' + esc(thread.mode) + ')')
    document.getElementById('mode-select').value = thread.mode || 'agent'
    activeMode = thread.mode || 'agent'
  }

  function renderTranscript(threadId, items) {
    var chat = document.getElementById('chat')
    if (!items || items.length === 0) {
      chat.innerHTML = '<div class="empty-state">Send a message to start</div>'
      return
    }
    chat.innerHTML = ''
    for (var i = 0; i < items.length; i++) {
      var item = items[i]
      if (item.kind === 'message' || item.role === 'system') {
        appendSystemMessage(esc(item.text || item.summary || ''))
      } else if (item.role === 'user') {
        appendUserMessage(esc(item.text || ''))
      } else if (item.role === 'assistant' || item.kind === 'assistant_text') {
        appendAssistantMessage(item.text || '')
      }
    }
  }

  function renderContextChips(chips) {
    contextChips = chips || []
    var bar = document.getElementById('context-bar')
    if (!chips || chips.length === 0) {
      bar.innerHTML = ''
      return
    }
    bar.innerHTML = chips
      .map(function (c, idx) {
        var cls = 'chip ' + (c.type || 'file')
        return (
          '<span class="' +
          cls +
          '" title="' +
          esc(c.relativePath || c.label) +
          '">' +
          esc(c.label) +
          '<span class="chip-close" data-idx="' +
          idx +
          '">&times;</span></span>'
        )
      })
      .join('')
    bar.querySelectorAll('.chip-close').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-idx'))
        contextChips.splice(idx, 1)
        renderContextChips(contextChips)
      })
    })
  }

  function renderApprovalsInline(approvals) {
    if (!approvals || approvals.length === 0) return
    for (var i = 0; i < approvals.length; i++) {
      var a = approvals[i]
      if (a.status !== 'pending') continue
      var remoteLabel =
        a.source === 'remote' ? '<span class="badge-remote">REMOTE</span>' : ''
      appendApprovalInline(a.id, a.toolName, a.summary, remoteLabel)
    }
  }

  /* ── event streaming ── */
  function handleEvent(msg) {
    var kind = msg.event || msg.kind || ''
    var chat = document.getElementById('chat')

    if (kind === 'assistant_text_delta' || kind === 'text') {
      appendStreamingText(msg.text || '', false)
    } else if (kind === 'assistant_reasoning_delta') {
      appendStreamingText(msg.text || '', true)
    } else if (kind === 'tool_call_ready' || kind === 'tool_call') {
      finalizeStreaming()
      appendToolStep(
        msg.name || msg.toolName || 'tool',
        msg.toolStatus || 'running',
        msg.toolInput
      )
      currentToolStep = chat.lastElementChild
    } else if (kind === 'tool_call_completed' || kind === 'tool_result') {
      updateToolStep(currentToolStep, msg.toolOutput || msg.output, 'done')
      currentToolStep = null
    } else if (kind === 'tool_call_failed' || kind === 'tool_error') {
      updateToolStep(currentToolStep, msg.message || 'Tool failed', 'error')
      currentToolStep = null
    } else if (
      kind === 'approval_requested' ||
      kind === 'approval_required' ||
      kind === 'approval'
    ) {
      finalizeStreaming()
      appendApprovalInline(
        msg.approvalId || msg.id,
        msg.toolName || msg.name,
        msg.summary || '',
        ''
      )
    } else if (kind === 'approval_resolved') {
      appendSystemMessage(
        'Approval ' + esc(msg.status || 'resolved') + ': ' + esc(msg.summary || '')
      )
    } else if (kind === 'file_change' || kind === 'file_change_proposed') {
      finalizeStreaming()
      appendFileChange(msg)
    } else if (kind === 'plan_mode_entry' || kind === 'plan') {
      appendPlanIndicator(msg.planEntry || msg.summary || 'Plan mode active')
    } else if (kind === 'turn_completed' || kind === 'done' || kind === 'completed') {
      finalizeStreaming()
    } else if (kind === 'turn_failed' || kind === 'turn_aborted') {
      finalizeStreaming()
      appendSystemMessage(
        (kind === 'turn_failed' ? 'Turn Failed' : 'Turn Aborted') +
          ': ' +
          esc(msg.message || ''),
        'error'
      )
    } else if (kind === 'error') {
      finalizeStreaming()
      appendSystemMessage('Error: ' + esc(msg.message || ''), 'error')
    }
  }

  function appendStreamingText(text, isReasoning) {
    if (
      !currentAssistantMsg ||
      currentAssistantMsg.dataset.reasoning !== String(isReasoning)
    ) {
      finalizeStreaming()
      currentAssistantMsg = document.createElement('div')
      currentAssistantMsg.className = 'msg assistant'
      currentAssistantMsg.dataset.reasoning = String(isReasoning)
      if (isReasoning) {
        currentAssistantMsg.style.opacity = '0.7'
        currentAssistantMsg.style.fontSize = '12px'
      }
      currentAssistantMsg.innerHTML =
        '<div class="streaming-content"></div><span class="streaming-cursor"></span>'
      document.getElementById('chat').appendChild(currentAssistantMsg)
    }
    var content = currentAssistantMsg.querySelector('.streaming-content')
    content.textContent += text
    content.innerHTML = renderMarkdown(content.textContent)
    currentAssistantMsg.scrollIntoView({ block: 'nearest' })
  }

  function finalizeStreaming() {
    if (currentAssistantMsg) {
      var cursor = currentAssistantMsg.querySelector('.streaming-cursor')
      if (cursor) cursor.remove()
      currentAssistantMsg = null
    }
  }

  function appendToolStep(name, status, input) {
    var step = document.createElement('div')
    step.className = 'tool-step'
    var statusCls =
      status === 'done' ? 'done' : status === 'error' ? 'error' : 'running'
    var icon = status === 'done' ? '\u2714' : status === 'error' ? '\u2716' : '\u2699'
    var inputText =
      typeof input === 'string' ? input : JSON.stringify(input || {}, null, 2)
    step.innerHTML =
      '<div class="tool-step-header" data-collapsed="0">' +
      '<span class="tool-icon">' +
      icon +
      '</span>' +
      '<span class="tool-name">' +
      esc(name) +
      '</span>' +
      '<span class="tool-status ' +
      statusCls +
      '">' +
      esc(status) +
      '</span>' +
      '<span style="font-size:10px;color:var(--ocx-dim)">\u25BC</span>' +
      '</div>' +
      '<div class="tool-body"><pre>' +
      esc(inputText) +
      '</pre></div>'
    step.querySelector('.tool-step-header').addEventListener('click', function () {
      step.classList.toggle('collapsed')
    })
    document.getElementById('chat').appendChild(step)
    step.scrollIntoView({ block: 'nearest' })
  }

  function updateToolStep(stepEl, output, newStatus) {
    if (!stepEl) return
    var body = stepEl.querySelector('.tool-body')
    if (body && output) {
      var outputText =
        typeof output === 'string' ? output : JSON.stringify(output || {}, null, 2)
      body.innerHTML = '<pre>' + esc(outputText) + '</pre>'
    }
    var statusEl = stepEl.querySelector('.tool-status')
    if (statusEl) {
      statusEl.textContent = newStatus
      statusEl.className =
        'tool-status ' +
        (newStatus === 'done' ? 'done' : newStatus === 'error' ? 'error' : 'running')
    }
    var iconEl = stepEl.querySelector('.tool-icon')
    if (iconEl) {
      iconEl.textContent =
        newStatus === 'done' ? '\u2714' : newStatus === 'error' ? '\u2716' : '\u2699'
    }
  }

  function appendApprovalInline(id, toolName, summary, remoteLabel) {
    var div = document.createElement('div')
    div.className = 'approval-inline'
    div.id = 'approval-' + esc(id)
    div.innerHTML =
      '<div class="approval-header">' +
      '\u26A0 Approval Required ' +
      (remoteLabel || '') +
      '</div>' +
      '<div><strong>' +
      esc(toolName) +
      '</strong></div>' +
      '<div class="approval-summary">' +
      esc(summary || '') +
      '</div>' +
      '<div class="approval-actions">' +
      '<button class="btn-allow" data-id="' +
      esc(id) +
      '" data-action="allow">Allow</button>' +
      '<button class="btn-deny" data-id="' +
      esc(id) +
      '" data-action="deny">Deny</button>' +
      '</div>'
    div.querySelector('.btn-allow').addEventListener('click', function () {
      post('respondApproval', { approvalId: id, action: 'allow' })
      div.querySelector('.approval-actions').innerHTML =
        '<span style="color:var(--ocx-success);font-size:12px">\u2714 Allowed</span>'
    })
    div.querySelector('.btn-deny').addEventListener('click', function () {
      post('respondApproval', { approvalId: id, action: 'deny' })
      div.querySelector('.approval-actions').innerHTML =
        '<span style="color:var(--ocx-err);font-size:12px">\u2716 Denied</span>'
    })
    document.getElementById('chat').appendChild(div)
    div.scrollIntoView({ block: 'nearest' })
  }

  function appendFileChange(msg) {
    var change = msg.fileChange || msg
    var div = document.createElement('div')
    div.className = 'tool-step'
    div.innerHTML =
      '<div class="tool-step-header" style="cursor:pointer">' +
      '<span class="tool-icon">\uD83D\uDCC4</span>' +
      '<span class="tool-name">Changed: ' +
      esc(change.path || msg.path || 'file') +
      '</span>' +
      '<span class="tool-status" style="color:var(--ocx-link);font-size:10px;cursor:pointer" data-action="diff">View Diff</span>' +
      '</div>' +
      '<div class="tool-body"><pre>' +
      esc(change.proposed || msg.proposed || '(binary or large change)') +
      '</pre></div>'
    div.querySelector('.tool-step-header').addEventListener('click', function () {
      div.classList.toggle('collapsed')
    })
    var diffBtn = div.querySelector('[data-action=diff]')
    if (diffBtn) {
      diffBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        post('showDiff', {
          eventId: msg.eventId || (change && change.eventId) || '',
          path: change.path || msg.path || '',
          original: change.original || '',
          proposed: change.proposed || '',
          threadId: msg.threadId || (change && change.threadId) || '',
          turnId: msg.turnId || (change && change.turnId) || '',
          toolName: msg.toolName || (change && change.toolName) || 'write_file'
        })
      })
    }
    document.getElementById('chat').appendChild(div)
    div.scrollIntoView({ block: 'nearest' })
  }

  function appendPlanIndicator(planText) {
    var div = document.createElement('div')
    div.className = 'plan-indicator'
    div.innerHTML = '\uD83D\uDCCB <strong>Plan:</strong> ' + esc(planText)
    document.getElementById('chat').appendChild(div)
    div.scrollIntoView({ block: 'nearest' })
  }

  function appendUserMessage(text) {
    var div = document.createElement('div')
    div.className = 'msg user'
    div.innerHTML = renderMarkdown(text)
    document.getElementById('chat').appendChild(div)
    div.scrollIntoView({ block: 'nearest' })
  }

  function appendAssistantMessage(text) {
    var div = document.createElement('div')
    div.className = 'msg assistant'
    div.innerHTML = renderMarkdown(text)
    document.getElementById('chat').appendChild(div)
    div.scrollIntoView({ block: 'nearest' })
  }

  function appendSystemMessage(text, cls) {
    var div = document.createElement('div')
    div.className = 'msg system' + (cls ? ' ' + cls : '')
    div.innerHTML = renderMarkdown(text)
    document.getElementById('chat').appendChild(div)
    div.scrollIntoView({ block: 'nearest' })
  }

  /* ── markdown renderer ── */
  function renderMarkdown(text) {
    if (!text) return ''
    var html = esc(text)

    // Code blocks: ```lang ... ```
    html = html.replace(
      /&#x60;&#x60;&#x60;(\w*)\n?([\s\S]*?)&#x60;&#x60;&#x60;/g,
      function (m, lang, code) {
        var unescaped = code
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
        var escapedCode = esc(unescaped)
        var escapedForAttr = escAttr(unescaped)
        return (
          '<div class="code-block">' +
          '<div class="code-header"><span>' +
          esc(lang || 'code') +
          '</span>' +
          '<div class="code-actions">' +
          '<button data-code="' +
          escapedForAttr +
          '" class="copy-btn">Copy</button>' +
          '<button data-code="' +
          escapedForAttr +
          '" class="insert-btn">Insert at Cursor</button>' +
          '</div></div>' +
          '<div class="code-body">' +
          escapedCode +
          '</div></div>'
        )
      }
    )

    // Inline code
    html = html.replace(
      /&#x60;([^&#x60;]+)&#x60;/g,
      '<code style="background:var(--ocx-code-bg);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:12px">$1</code>'
    )

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Blockquote
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    // HR
    html = html.replace(/^---$/gm, '<hr>')
    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>')
    html = '<p>' + html + '</p>'
    return html
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function escAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  /* ── UI bindings ── */
  function updateSendBtn() {
    var btn = document.getElementById('send-btn')
    var input = document.getElementById('prompt-input')
    btn.disabled = !activeThreadId || !input.value.trim()
  }

  function refreshAll() {
    post('refreshContext', {})
    post('ready', {})
  }

  document.getElementById('send-btn').addEventListener('click', function () {
    var input = document.getElementById('prompt-input')
    var text = input.value.trim()
    if (!text || !activeThreadId) return
    appendUserMessage(text)
    post('sendTurn', { threadId: activeThreadId, prompt: text, mode: activeMode })
    input.value = ''
    updateSendBtn()
    contextChips = []
    renderContextChips([])
  })

  document.getElementById('prompt-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      document.getElementById('send-btn').click()
    }
  })

  document.getElementById('prompt-input').addEventListener('input', function () {
    updateSendBtn()
  })

  document.getElementById('btn-new-thread').addEventListener('click', function () {
    post('createThread', {})
  })

  document.getElementById('btn-attach-file').addEventListener('click', function () {
    post('refreshContext', {})
  })

  document.getElementById('btn-attach-sel').addEventListener('click', function () {
    post('refreshContext', {})
  })

  document.getElementById('btn-attach-pick').addEventListener('click', function () {
    post('pickFile', {})
  })

  document.getElementById('mode-select').addEventListener('change', function () {
    activeMode = this.value
  })

  // Delegate click events for code block buttons (copy / insert at cursor)
  document.addEventListener('click', function (e) {
    var target = e.target
    if (target.classList.contains('copy-btn')) {
      var code = target.getAttribute('data-code') || ''
      navigator.clipboard.writeText(code).then(function () {
        target.textContent = 'Copied!'
        setTimeout(function () {
          target.textContent = 'Copy'
        }, 1500)
      })
    } else if (target.classList.contains('insert-btn')) {
      var codeText = target.getAttribute('data-code') || ''
      vscode.postMessage({ command: 'insertAtCursor', text: codeText })
    }
  })

  // Initial ready signal
  post('ready', {})
})()
