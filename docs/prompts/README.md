# OpenCodex Desktop Phase Prompts

This folder contains paste-ready goal prompts for OpenCodex Desktop phases.
Each file is designed to be opened in a fresh agent window without relying on
chat history.

## Model Ladder

Use the user's available GPT stack this way:

| Work type | Recommended model |
|---|---|
| Tiny docs cleanup, status checks, formatting | `gpt-5.3-codex-spark`, reasoning `low` |
| Routine docs, simple UI polish, narrow tests | `gpt-5.4-mini`, reasoning `medium` |
| Normal implementation, renderer/main process changes, focused reviews | `gpt-5.4`, reasoning `high` |
| Kernel, security, model routing, subagents, remote/mobile, protocol design | `gpt-5.5`, reasoning `high` or `extra high` |

Cheap child agents should default to `gpt-5.4-mini` with reasoning `low` or
`medium`. Use `gpt-5.3-codex-spark` only for very small inventory or formatting
lanes.

## Phase Prompt Index

| Phase | Prompt file | Primary model |
|---|---|---|
| Audit | [OPENCODEX_PROGRESS_AUDIT_PROMPT.md](./OPENCODEX_PROGRESS_AUDIT_PROMPT.md) | `gpt-5.5`, reasoning `extra high` |
| S1 | [PHASE_S1_BASELINE_PRESERVE_AND_STAGE.md](./PHASE_S1_BASELINE_PRESERVE_AND_STAGE.md) | `gpt-5.5`, reasoning `high` |
| 0 | [PHASE_0_FORK_REBRAND_ARABIC_FOUNDATION.md](./PHASE_0_FORK_REBRAND_ARABIC_FOUNDATION.md) | `gpt-5.4`, reasoning `high` |
| 0.5 | [PHASE_0_5_CODEX_PARITY_REFERENCE_INTAKE.md](./PHASE_0_5_CODEX_PARITY_REFERENCE_INTAKE.md) | `gpt-5.5`, reasoning `high` |
| 1 | [PHASE_1_USER_AGENT_STACK_IMPORT.md](./PHASE_1_USER_AGENT_STACK_IMPORT.md) | `gpt-5.4`, reasoning `high` |
| 2 | [PHASE_2_MULTI_PROVIDER_MODEL_RUNTIME.md](./PHASE_2_MULTI_PROVIDER_MODEL_RUNTIME.md) | `gpt-5.5`, reasoning `high` |
| 3 | [PHASE_3_SUBAGENTS_SWARM_WORKFLOWS.md](./PHASE_3_SUBAGENTS_SWARM_WORKFLOWS.md) | `gpt-5.5`, reasoning `high` |
| 3.5 | [PHASE_3_5_GOAL_LOOP_AUTOMATIONS.md](./PHASE_3_5_GOAL_LOOP_AUTOMATIONS.md) | `gpt-5.5`, reasoning `extra high` |
| 4 | [PHASE_4_BROWSER_COMPUTER_CONTROL_FOUNDATION.md](./PHASE_4_BROWSER_COMPUTER_CONTROL_FOUNDATION.md) | `gpt-5.5`, reasoning `extra high` |
| 4.5 | [PHASE_4_5_REMOTE_RELAY_MOBILE_ACCESS.md](./PHASE_4_5_REMOTE_RELAY_MOBILE_ACCESS.md) | `gpt-5.5`, reasoning `extra high` |
| 5 | [PHASE_5_CODEX_WORKBENCH_UX.md](./PHASE_5_CODEX_WORKBENCH_UX.md) | `gpt-5.4`, reasoning `high` |
| 6 | [PHASE_6_GIT_WORKTREES_REVIEW.md](./PHASE_6_GIT_WORKTREES_REVIEW.md) | `gpt-5.5`, reasoning `high` |
| 7 | [PHASE_7_SKILLS_PLUGINS_HOOKS_MEMORY.md](./PHASE_7_SKILLS_PLUGINS_HOOKS_MEMORY.md) | `gpt-5.5`, reasoning `high` |
| 8 | [PHASE_8_APP_SERVER_CLI_IDE_PROTOCOL.md](./PHASE_8_APP_SERVER_CLI_IDE_PROTOCOL.md) | `gpt-5.5`, reasoning `extra high` |
| 9 | [PHASE_9_REMOTE_RUNNERS_SSH_HOSTS.md](./PHASE_9_REMOTE_RUNNERS_SSH_HOSTS.md) | `gpt-5.5`, reasoning `extra high` |
| 10 | [PHASE_10_PARITY_HARDENING_RELEASE.md](./PHASE_10_PARITY_HARDENING_RELEASE.md) | `gpt-5.5`, reasoning `extra high` |

## Global Rules For Every Phase

- Keep Kun as the single OpenCodex kernel unless a written audit proves a hard
  blocker.
- Keep Electron as the desktop shell.
- Preserve English, Arabic, and Chinese language support.
- Preserve upstream DeepSeek GUI attribution and sync path.
- Do not add personal branding to public product surfaces.
- Do not expose API keys, OAuth tokens, `.env` values, private payloads,
  cookies, or raw provider credentials.
- Do not push, deploy, publish, or mutate live infrastructure unless the user
  explicitly asks for that in the active window.
- Preserve unrelated dirty and untracked files.
- Run phase-specific tests plus `npm test`, `npm run typecheck`, and
  `npm run build` when the phase changes code.
