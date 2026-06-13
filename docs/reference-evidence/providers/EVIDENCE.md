# Provider Experience Reference Evidence

Built for M2.5 Provider Experience Parity on 2026-06-13.

## Local Install Proof

VS Code `1.124.2` on macOS arm64 has the reference extensions installed:

| Extension | Version | Installed id |
|---|---:|---|
| Cline | 3.89.2 | `saoudrizwan.claude-dev` |
| Kilo Code | 7.3.45 | `kilocode.kilo-code` |
| Roo Code | 3.54.0 | `RooVeterinaryInc.roo-cline` |
| Continue | 1.2.22 | `Continue.continue` |

Screenshot proof: `../ide/vscode--reference-extensions-installed--01.png`.

No paid provider login or API key entry was performed during evidence capture.

## Evidence Matrix

| Feature | Reference app | Behavior notes (flow, states, edge cases) | Screenshot | Source | Priority |
|---|---|---|---|---|---|
| Provider connect flow | Kilo Code | Settings are opened from the Kilo gear. The Settings UI is tabbed and includes Providers, Auto-Approve, Models, and related config surfaces. It reads/writes shared JSONC config used across sidebar, Agent Manager, CLI, and project/global scopes. | `../ide/vscode--reference-extensions-installed--01.png` | https://kilo.ai/docs/getting-started/settings | P1 |
| BYOK provider setup | Roo Code | First-run provider setup starts from the Roo Code panel, asks the user to choose a provider, paste a provider API key, then select a model and complete setup. | `../ide/vscode--reference-extensions-installed--01.png` | https://docs.roocode.com/getting-started/connecting-api-provider | P1 |
| OAuth/account setup | Cline | Cline settings provide a provider selection flow. For Cline provider, user opens settings, chooses provider, signs in in browser, selects a model, then verifies by sending a test message. | `../ide/vscode--reference-extensions-installed--01.png` | https://docs.cline.bot/getting-started/cline-provider | P1 |
| Model picker | Cline | Provider setup includes an explicit Model dropdown after provider/auth selection. This makes model selection a first-class configuration step rather than buried in runtime settings. | `../ide/vscode--reference-extensions-installed--01.png` | https://docs.cline.bot/getting-started/cline-provider | P1 |
| Provider profiles/config files | Kilo Code | Kilo separates VS Code extension UI settings from shared runtime config. Global config lives under `~/.config/kilo/kilo.jsonc`; project config can live in `kilo.jsonc` or `.kilo/kilo.jsonc`. UI includes local/global config selection. | `../ide/vscode--reference-extensions-installed--01.png` | https://kilo.ai/docs/getting-started/settings | P1 |
| Secret handling warning | Kilo Code | Kilo docs explicitly warn users not to commit config files with API keys or other secrets and recommend environment variables for credentials. | `../ide/vscode--reference-extensions-installed--01.png` | https://kilo.ai/docs/getting-started/settings | P1 |
| Mode/profile assignment | Kilo Code | Kilo supports multi-mode workflows and custom modes; its docs describe Plan/Architect, Code/Coder, Debug/Debugger style task behaviors and custom modes. M2.5 should expose model/provider assignment per mode or document a deliberate gap. | `../ide/vscode--reference-extensions-installed--01.png` | https://github.com/kilo-org/kilocode | P1 |
| Auto-approval settings | Roo Code | Roo exposes settings for auto-approval, diff editing, custom modes, `.roorules`, and mode-specific behavior. Provider UX should not be isolated from approval risk settings. | `../ide/vscode--reference-extensions-installed--01.png` | https://docs.roocode.com/faq | P2 |
| Import/export/reset settings | Roo Code | Roo settings include export, import, and reset controls at the bottom of settings. Useful for portability, but OpenCodex must redact secrets if implemented. | `../ide/vscode--reference-extensions-installed--01.png` | https://docs.roocode.com/features/settings-management/ | P2 |
| Provider balance/usage metadata | Roo Code | Roo release notes call out OpenRouter/Requesty credit balance checks inside provider settings. OpenCodex can surface key metadata/limits already available from M2, but billing dashboards remain out of scope. | `../ide/vscode--reference-extensions-installed--01.png` | https://docs.roocode.com/update-notes/v3.11 | P2 |
| Context provider configuration | Continue | Continue uses config-defined context providers and model/provider configuration in YAML/JSON references. M2.5 should prefer UI-first config, with file-backed config only as an advanced surface. | `../ide/vscode--reference-extensions-installed--01.png` | https://docs.continue.dev/reference | P2 |
| Paid managed credits | Kilo Code / Cline | Both offer account/credit flows. OpenCodex should not clone credit purchase flows in M2.5 unless a future business model requires it. | `../ide/vscode--reference-extensions-installed--01.png` | https://marketplace.visualstudio.com/items?itemName=kilocode.Kilo-Code; https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev | P3 |

## P1 Implementation Expectations For M2.5

| P1 behavior | Required OpenCodex mapping |
|---|---|
| One obvious provider onboarding path | Providers settings must show OpenRouter OAuth, DeepSeek BYOK, and custom OpenAI-compatible setup without hidden controls. |
| Model picker after provider setup | Successful connect/validate should immediately refresh model list and expose model selection. |
| Provider/profile scopes | UI must make global vs project/provider profile behavior clear, or explicitly document why OpenCodex uses one scope. |
| Mode/model assignment | At minimum, support or visibly plan per-task/per-mode provider+model defaults. |
| Secret-safe config | Raw keys must never appear in app settings, Kun config, exports, screenshots, logs, or renderer state. |

## What We Will NOT Copy

- Do not copy brand names, icons, colors, splash illustrations, marketplace copy, or provider marketing text.
- Do not copy paid account/credit-purchase flows.
- Do not copy proprietary prompts or hidden system instructions.
- Do not store provider secrets in checked-in project config.
- Do not require a reference-extension account to use OpenCodex provider setup.
