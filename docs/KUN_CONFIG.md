# Kun Agent 与模型配置说明

本文说明 DeepSeek GUI / Kun 的本地配置文件在哪里、哪些字段由 UI 管理、哪些字段适合手工扩展，以及模型上下文压缩阈值应该如何配置。

## 配置文件分层

DeepSeek GUI 有两层配置。

1. GUI settings

   这是桌面应用自己的设置文件，保存设置页里的 Agent 运行时选项。

   - macOS: `~/Library/Application Support/DeepSeek GUI/deepseek-gui-settings.json`
   - Windows: `%APPDATA%/DeepSeek GUI/deepseek-gui-settings.json`
   - Linux: `~/.config/DeepSeek GUI/deepseek-gui-settings.json`

   Agent 运行时设置在 `agents.kun` 下，例如端口、data dir、默认模型、审批策略、sandbox、token economy 等。多数用户通过设置页修改这些字段。

2. Kun runtime config

   这是 Kun 本地运行时读取的高级配置文件。默认路径是：

   ```text
   ~/.opencodex/kun/config.json
   ```

   如果 `agents.kun.dataDir` 改成了别的目录，实际路径就是：

   ```text
   <dataDir>/config.json
   ```

   `kun serve --config <path>` 可以显式指定配置文件；如果没有指定，Kun 会尝试读取 `{dataDir}/config.json`。

## 启动时的读取顺序

GUI 启动 Kun 时会按下面的顺序合并配置。

1. GUI 读取 `deepseek-gui-settings.json`，得到 `agents.kun` 和通用 provider 配置。
2. GUI 在启动 Kun 前同步 `<dataDir>/config.json`，写入 UI 管理的 token economy、默认压缩摘要参数、默认模型 profiles、runtime tuning、MCP search、附件能力和实验性 automation 能力。
3. Kun serve 读取 `<dataDir>/config.json` 或 `--config` 指定的文件。
4. CLI 参数和环境变量会覆盖 `serve` 里的基础启动字段，例如 `--model`、`--port`、`KUN_MODEL`、`KUN_PORT`。
5. AgentLoop、review loop 和子 Agent 都从同一份模型配置加载模型能力与上下文压缩阈值。

## 推荐的 config.json 结构

```json
{
  "serve": {
    "host": "127.0.0.1",
    "port": 18999,
    "dataDir": "~/.opencodex/kun",
    "runtimeToken": "",
    "apiKey": "",
    "baseUrl": "https://api.deepseek.com/beta",
    "model": "deepseek-v4-pro",
    "approvalPolicy": "auto",
    "sandboxMode": "workspace-write"
  },
  "models": {
    "profiles": {
      "deepseek-v4-pro": {
        "contextWindowTokens": 1000000,
        "contextCompaction": {
          "softThreshold": 980000,
          "hardThreshold": 990000
        },
        "inputModalities": ["text"],
        "outputModalities": ["text"],
        "supportsToolCalling": true,
        "messageParts": ["text"]
      }
    }
  },
  "contextCompaction": {
    "defaultSoftThreshold": 16000,
    "defaultHardThreshold": 24000,
    "summaryMode": "heuristic",
    "summaryTimeoutMs": 15000,
    "summaryMaxTokens": 1200,
    "summaryInputMaxBytes": 98304
  }
}
```

## 模型配置写在哪里

模型相关配置写在顶层 `models.profiles`。

每个 key 是模型 ID。模型 ID 会按小写匹配，也支持 provider 前缀，例如请求模型是 `vendor/deepseek-v4-pro` 时，也可以匹配 `deepseek-v4-pro`。

```json
{
  "models": {
    "profiles": {
      "my-128k-model": {
        "aliases": ["vendor/my-128k-model"],
        "contextWindowTokens": 128000,
        "contextCompaction": {
          "softRatio": 0.85,
          "hardRatio": 0.93
        },
        "inputModalities": ["text"],
        "outputModalities": ["text"],
        "supportsToolCalling": true,
        "messageParts": ["text"]
      }
    }
  }
}
```

可用字段：

- `aliases`: 这个 profile 还要匹配的模型别名。
- `providerId`: 模型所属供应商，例如 `deepseek` 或 `openrouter`。
- `name`: 用于设置页和诊断的模型显示名。
- `tokenizer`: 上游目录返回的 tokenizer 假设；没有时可以省略。
- `contextWindowTokens`: 模型上下文窗口大小。
- `contextCompaction.softThreshold`: 达到多少 input tokens 后开始压缩。
- `contextCompaction.hardThreshold`: 达到多少 input tokens 后强制更激进压缩。
- `contextCompaction.softRatio`: 按 `contextWindowTokens` 比例计算 soft threshold。
- `contextCompaction.hardRatio`: 按 `contextWindowTokens` 比例计算 hard threshold。
- `pricingUsdPerMillion`: 每百万 tokens 的美元价格，支持 `input`、`output`、`cacheRead`、`cacheWrite`。
- `inputModalities`: 输入模态，目前常用 `["text"]` 或 `["text", "image"]`。
- `outputModalities`: 输出模态，通常是 `["text"]`。
- `supportsToolCalling`: 模型是否支持 tool calling。
- `supportsReasoning`: 模型是否支持 reasoning 参数或推理能力。
- `recommendedUse`: 自动路由提示用途，例如 `["coding", "review", "research"]`。
- `messageParts`: 模型消息 part 能力，例如 `["text"]` 或 `["text", "image_url"]`。

如果同时写了 `softThreshold` 和 `softRatio`，显式 token 阈值优先。`hardThreshold` 必须大于或等于 `softThreshold`。

## OpenRouter 模型目录与价格

Settings 的 provider 配置现在内置 DeepSeek 和 OpenRouter 两个 profile。DeepSeek 仍然是默认 provider；OpenRouter 的默认 base URL 是：

```text
https://openrouter.ai/api/v1
```

设置页的模型选择器可以刷新 OpenRouter 目录，调用：

```text
https://openrouter.ai/api/v1/models
```

刷新结果会保存在 GUI settings 的 `provider.providers[].catalogModels`，只包含模型元数据，不保存 API key 副本。GUI 同步 Kun config 时，会把目录模型写入 `models.profiles`，例如：

```json
{
  "models": {
    "profiles": {
      "openai/gpt-4.1-mini": {
        "providerId": "openrouter",
        "name": "OpenAI: GPT-4.1 Mini",
        "tokenizer": "o200k_base",
        "contextWindowTokens": 1047576,
        "contextCompaction": {
          "softThreshold": 942818,
          "hardThreshold": 995197
        },
        "pricingUsdPerMillion": {
          "input": 0.4,
          "output": 1.6,
          "cacheRead": 0.1,
          "cacheWrite": 0.4
        },
        "inputModalities": ["text"],
        "outputModalities": ["text"],
        "supportsToolCalling": true,
        "supportsReasoning": true,
        "recommendedUse": ["coding", "review", "research"],
        "messageParts": ["text"]
      }
    }
  }
}
```

OpenRouter `/models` 返回的价格是按 token 计价的字符串；GUI 会归一化成每百万 tokens 的美元价格。Kun runtime 用这些 profile 估算 turn 的 `costUsd`，并用同一份输入价格估算 token economy 省下的 input token 成本；但不会为 OpenRouter 估算 `costCny`。如果上游没有返回 cache hit/miss 字段，`cacheHitTokens` 和 `cacheMissTokens` 会保持缺失，`cacheHitRate` 为 `null`；不会把未知缓存命中率显示成 `0`。

## 默认模型 profile

Kun 内置 DeepSeek V4 默认模型画像：

```json
{
  "models": {
    "profiles": {
      "deepseek-v4-pro": {
        "contextWindowTokens": 1000000,
        "contextCompaction": {
          "softThreshold": 980000,
          "hardThreshold": 990000
        },
        "inputModalities": ["text"],
        "outputModalities": ["text"],
        "supportsToolCalling": true,
        "messageParts": ["text"]
      },
      "deepseek-v4-flash": {
        "aliases": ["deepseek-chat", "deepseek-reasoner"],
        "contextWindowTokens": 1000000,
        "contextCompaction": {
          "softThreshold": 980000,
          "hardThreshold": 990000
        },
        "inputModalities": ["text"],
        "outputModalities": ["text"],
        "supportsToolCalling": true,
        "messageParts": ["text"]
      }
    }
  }
}
```

也就是说，V4 是 1M 上下文，正常情况下接近 `980k` input tokens 才触发上下文压缩；接近 `990k` 时进入更强的压缩策略。

## 全局压缩配置写在哪里

全局压缩配置写在顶层 `contextCompaction`。它只负责“不知道具体模型 profile 时的兜底阈值”和“摘要行为”，不要再把模型窗口大小写在这里。

```json
{
  "contextCompaction": {
    "defaultSoftThreshold": 16000,
    "defaultHardThreshold": 24000,
    "summaryMode": "heuristic",
    "summaryTimeoutMs": 15000,
    "summaryMaxTokens": 1200,
    "summaryInputMaxBytes": 98304
  }
}
```

字段说明：

- `defaultSoftThreshold`: 未匹配到模型 profile 时，达到多少 input tokens 开始压缩。
- `defaultHardThreshold`: 未匹配到模型 profile 时，达到多少 input tokens 强制压缩。
- `summaryMode`: `heuristic` 使用本地摘要骨架，`model` 会尝试调用模型生成摘要。
- `summaryTimeoutMs`: 模型摘要调用超时时间。
- `summaryMaxTokens`: 模型摘要输出 token 上限。
- `summaryInputMaxBytes`: 摘要输入文本最大字节数。

## Agent 配置写在哪里

普通 Agent 运行时配置由 GUI settings 的 `agents.kun` 管理。主要字段：

```json
{
  "agents": {
    "kun": {
      "binaryPath": "",
      "port": 18999,
      "autoStart": true,
      "dataDir": "~/.opencodex/kun",
      "model": "deepseek-v4-pro",
      "approvalPolicy": "auto",
      "sandboxMode": "workspace-write",
      "tokenEconomyMode": false,
      "insecure": false
    }
  }
}
```

设置页会保存这些字段。GUI 模式下默认模型以 `agents.kun.model` 为准；`config.json` 里的 `serve.model` 更适合 standalone `kun serve` 使用，因为 GUI 启动时会把设置页里的模型作为启动参数传给 Kun。

## User Agent Stack 导入档案

Phase 1 增加了通用的 User Agent Stack 导入档案。它仍然写在 GUI settings 的 `agents.kun` 下，不会增加第二个运行时：

```json
{
  "agents": {
    "kun": {
      "userAgentStack": {
        "enabled": true,
        "importedAt": "2026-06-09T00:00:00.000Z",
        "refreshedAt": "2026-06-09T00:00:00.000Z",
        "sourcePaths": ["~/.codex/config.toml"],
        "skillRoots": [],
        "mcpServers": [],
        "cli": [],
        "redactedPreviewJson": "{...}",
        "validationErrors": []
      }
    }
  }
}
```

导入来源包括当前工作区的 `.codex/skills`、`.agents/skills`、用户目录下的 `~/.codex/skills`、`~/.agents/skills`、Codex plugin cache 中的 skill roots，以及 Codex/user MCP 配置文件。Settings 页面只展示和保存脱敏后的预览；token、password、authorization header、secret-like env、带 token 的 URL 参数，以及 `--token` / `--api-key` 这类参数后的值都会写成 `<redacted>`。

GUI 启动或同步 Kun config 时，会把 `agents.kun.userAgentStack.skillRoots` 中可用的目录合并到 `capabilities.skills.roots`，并把 `agents.kun.userAgentStack.mcpServers` 中的脱敏 MCP 定义合并到 `capabilities.mcp.servers`。CLI 状态只保存在 GUI settings 里用于设置页展示，不会作为 Kun 工具运行。

## Subagents 与 swarm 预算配置

Phase 3 的子 Agent 配置同样从 GUI settings 的 `agents.kun.subagents`
同步到 Kun runtime 的 `capabilities.subagents`。这不是第二个运行时；
`delegate_task` 仍然只通过 Kun/OpenCodex kernel 执行。

```json
{
  "agents": {
    "kun": {
      "subagents": {
        "enabled": false,
        "defaultModel": "deepseek-v4-flash",
        "defaultPreset": "research_split",
        "maxParallel": 2,
        "maxChildRuns": 4,
        "maxTotalChildTokens": 50000,
        "maxChildCostUsd": 1,
        "perAgentTimeoutMs": 120000,
        "workflowPresets": {
          "review_swarm": {
            "enabled": true,
            "defaultModel": "deepseek-v4-flash",
            "maxParallel": 4,
            "maxChildRuns": 8,
            "maxTotalChildTokens": 80000,
            "maxChildCostUsd": 1,
            "perAgentTimeoutMs": 90000
          },
          "implementation_split": {
            "enabled": true,
            "defaultModel": "deepseek-v4-flash",
            "maxParallel": 2,
            "maxChildRuns": 4,
            "maxTotalChildTokens": 70000,
            "maxChildCostUsd": 1.5,
            "perAgentTimeoutMs": 180000
          },
          "research_split": {
            "enabled": true,
            "defaultModel": "deepseek-v4-flash",
            "maxParallel": 3,
            "maxChildRuns": 6,
            "maxTotalChildTokens": 50000,
            "maxChildCostUsd": 1,
            "perAgentTimeoutMs": 120000
          },
          "audit_split": {
            "enabled": true,
            "defaultModel": "deepseek-v4-flash",
            "maxParallel": 3,
            "maxChildRuns": 6,
            "maxTotalChildTokens": 80000,
            "maxChildCostUsd": 1.5,
            "perAgentTimeoutMs": 150000
          }
        }
      }
    }
  }
}
```

字段说明：

- `enabled`: 关闭时 Kun 不会注册或执行 `delegate_task`。
- `defaultModel`: 子 Agent 默认模型。GUI 默认使用 `deepseek-v4-flash`，让
  parent thread 可以使用更强模型，而 child runs 默认走便宜模型。
- `defaultPreset`: 工具调用未指定 preset 时的默认工作流。
- `maxParallel`: 同一父线程允许同时运行的 child agents 上限。
- `maxChildRuns`: 同一父线程允许创建的 child run 总数上限。
- `maxTotalChildTokens`: 所有 child runs 聚合后的 token 上限；达到后拒绝后续委派。
- `maxChildCostUsd`: 所有 child runs 聚合后的美元成本上限；达到后拒绝后续委派。
- `perAgentTimeoutMs`: 每个 child run 的超时时间；超时会中断对应 Kun turn。
- `workflowPresets`: `review_swarm`、`implementation_split`、`research_split`
  和 `audit_split` 的预算 profile。`delegate_task` 可以传入 `preset` 使用其中一个 profile。

每个完成的 child run 会把 usage、cost、cache hit/miss、cache savings 和摘要
汇总回 parent thread。`GET /v1/runtime/tools` 的 diagnostics 会返回 child run
列表、聚合 usage 和 summaries；SSE child lifecycle events 会带上 child model、
preset、状态与 usage，供聊天 timeline 显示折叠 trace/status。

## Browser automation 与 computer control foundation

Phase 4 增加了实验性的 automation foundation。它同样从 GUI settings 的
`agents.kun.automation` 同步到 Kun runtime 的 `capabilities.automation`。
这只是安全基础，不是无限制电脑控制；Electron 仍然是 shell，Kun 仍然是
kernel，renderer 不运行 Playwright、CDP、OS input 或本地文件访问。

```json
{
  "agents": {
    "kun": {
      "automation": {
        "enabled": false,
        "browserWorkbenchEnabled": true,
        "localDevOnly": true,
        "allowedHosts": ["localhost", "127.0.0.1", "::1"],
        "permissions": {
          "browserNavigation": "ask",
          "browserInteraction": "ask",
          "screenshots": "ask",
          "localFileAccess": "deny",
          "appControl": "deny"
        },
        "auditLog": {
          "enabled": true,
          "maxEntries": 500
        }
      }
    }
  }
}
```

字段说明：

- `enabled`: 实验性 automation 总开关；默认关闭。关闭时 Kun 不注册 automation tools。
- `browserWorkbenchEnabled`: 允许显示手动 browser/workbench panel；它不是自动化执行器。
- `localDevOnly`: 开启时 browser navigation 只允许 `allowedHosts` 中的本地/开发 host。
- `allowedHosts`: 默认 `localhost`、`127.0.0.1` 和 `::1`。GUI 会去重、归一化并限制数量。
- `permissions.browserNavigation`: browser navigate 的 permission gate。
- `permissions.browserInteraction`: click/type 的 permission gate。
- `permissions.screenshots`: screenshot capture 的 permission gate。
- `permissions.localFileAccess`: 本地文件访问 gate；默认 deny，即使 allow 也只能访问当前 workspace 内路径。
- `permissions.appControl`: app/computer control gate；Phase 4 中始终拒绝实际执行。
- `auditLog`: action audit 设置；Kun 会发出 requested、allowed、blocked、completed 和 failed automation audit events。关闭 audit log 时 Kun 不注册 automation tools。

Automation tools 只通过 Kun automation sidecar port 执行。当前内置 no-op/mock
adapter 用于测试和安全占位；真实 browser host 或 native adapter 必须在后续 phase
中接入 sidecar boundary，并补齐 OS 权限、可见 control banner、emergency stop、
redaction 和更完整的 audit/evidence UI。

## 用户如何自定义

常见做法：

1. 在设置页修改端口、data dir、默认模型、审批策略、sandbox 和 token economy。
2. 打开 `<dataDir>/config.json`，在 `models.profiles` 里增加或覆盖模型 profile。
3. 如果要把自定义模型作为 GUI 默认模型，把 `agents.kun.model` 改成该模型 ID。
4. 重启 Kun runtime，让新配置生效。

自定义 1M 模型并在 950k 左右开始压缩：

```json
{
  "models": {
    "profiles": {
      "vendor/my-1m-model": {
        "aliases": ["my-1m-model"],
        "contextWindowTokens": 1000000,
        "contextCompaction": {
          "softThreshold": 950000,
          "hardThreshold": 980000
        },
        "inputModalities": ["text"],
        "outputModalities": ["text"],
        "supportsToolCalling": true,
        "messageParts": ["text"]
      }
    }
  }
}
```

自定义图片输入模型：

```json
{
  "models": {
    "profiles": {
      "vision-model": {
        "contextWindowTokens": 128000,
        "contextCompaction": {
          "softRatio": 0.75,
          "hardRatio": 0.9
        },
        "inputModalities": ["text", "image"],
        "outputModalities": ["text"],
        "supportsToolCalling": true,
        "messageParts": ["text", "image_url"]
      }
    }
  }
}
```

## 兼容旧配置

旧版本曾支持把模型 profile 写在：

```json
{
  "contextCompaction": {
    "modelProfiles": {}
  }
}
```

这个位置仍然会被读取，以免已有用户配置失效。但新配置请使用：

```json
{
  "models": {
    "profiles": {}
  }
}
```

当两个位置都写了同一个模型时，`models.profiles` 的配置优先。

## 相关源码

- 默认 GUI Agent 设置：`src/shared/app-settings-kun.ts`
- GUI 同步 `<dataDir>/config.json`：`src/main/kun-process.ts`
- Kun config schema：`kun/src/config/kun-config.ts`
- 模型 profile 解析：`kun/src/loop/model-context-profile.ts`
- 上下文压缩器：`kun/src/loop/context-compactor.ts`
- serve 解析入口：`kun/src/cli/serve.ts`
- 示例配置：`kun/config.example.json`
