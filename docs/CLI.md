# OpenCodex CLI

A thin app-server protocol adapter for the Kun runtime. All business logic
lives in Kun; the CLI is a transport + UX shell.

## Installation

```bash
cd clients/cli
npm install
npm run build
```

Run directly:
```bash
node dist/index.js <command>
```

Or link for system-wide use (no global publish):
```bash
npm pack
npm install -g ./opencodex-cli-0.1.0.tgz
```

## Commands

### `opencodex chat`
Interactive turn loop with streamed events. Connects to a running Kun server.
Supports `--workspace`, `--model`, `--title`, `--mode`.

```
opencodex chat --workspace /path/to/project --model gpt-5.5
```

In-chat commands: `/exit`, `/quit`.

### `opencodex threads list`
List recent threads.

```
opencodex threads list --limit 10 --search "keyword"
```

### `opencodex threads show <id>`
Show thread details.

```
opencodex threads show thr_abc123
```

### `opencodex send <thread-id> <prompt>`
Send a one-shot turn to an existing thread and stream the response.

```
opencodex send thr_abc123 "Fix the type errors in src/server.ts"
```

### `opencodex approve list`
List pending approval requests. Requires a thread ID (approvals are thread-scoped).

```
opencodex approve list --thread thr_abc123
```

### `opencodex approve allow <id>`
Approve a pending tool execution.

```
opencodex approve allow app_xyz789
```

### `opencodex approve deny <id>`
Deny a pending tool execution.

```
opencodex approve deny app_xyz789
```

### `opencodex usage`
Show telemetry summary (tokens, cost, cache hit rate).

```
opencodex usage
opencodex usage --thread thr_abc123
```

### `opencodex serve`
Thin delegate: spawns the Kun headless serve process (`kun serve`) and proxies
signals. All flags are forwarded.

```
opencodex serve --port 18999 --data-dir /tmp/kun --insecure --approval-policy on-request
```

### `opencodex health`
Check server health and protocol version.

## Environment Variables

| Variable           | Default       | Description          |
|--------------------|---------------|----------------------|
| `OPENCODEX_TOKEN`  | (none)        | Local auth token     |
| `OPENCODEX_HOST`   | `127.0.0.1`   | Server host          |
| `OPENCODEX_PORT`   | `18999`       | Server port          |

The CLI also reads `KUN_RUNTIME_TOKEN`, `KUN_PORT` as fallbacks.

## Architecture

The CLI never executes business logic directly. Every command translates to
HTTP/SSE calls against the Kun runtime via the app-server protocol. Auth is
loopback-only with an optional local token.

## Tests

```bash
npm test
```

Tests cover: command parsing, protocol client operations, SSE streaming,
auth config, and error paths.
