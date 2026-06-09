# Phase 0.5 Prompt: Codex-Parity Reference Intake

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `high`
- Why: this is architecture and product-direction work. It decides how Codex,
  Claude Code, OpenHanako, Reasonix, and other references map into the Kun
  kernel without creating a second runtime or unsafe desktop-control path.
- Cheap helper agents: `gpt-5.4-mini`, reasoning `medium`, for read-only
  reference inventory only.

## Paste-Ready Goal

```text
/goal Phase 0.5: Codex-Parity Reference Intake and Engine Direction

Run from the OpenCodex Desktop repository root.

Objective:
Create the written foundation for OpenCodex Desktop before deeper
implementation. Codex is the quality and capability compass, but OpenCodex
Desktop remains an independent open agent workbench and is not affiliated with
OpenAI. DeepSeek GUI/Kun is the fork foundation and upstream merge source. Kun
remains the single runtime/kernel unless a written audit proves it cannot
evolve into the OpenCodex kernel.

Model:
Use gpt-5.5 with reasoning high. Use gpt-5.4-mini medium only for independent
read-only reference scans.

Required deliverables:
1. docs/REFERENCE_INTAKE.md
2. docs/ENGINE_AUDIT_KUN.md
3. docs/DESKTOP_UX_BENCHMARK.md
4. docs/BROWSER_COMPUTER_CONTROL_PLAN.md
5. README.md, LANDING.md, and NOTICE.md attribution updates if stale

Rules:
- This is a docs-only phase. Do not implement app features.
- Do not add a second runtime beside Kun.
- Do not remove Electron.
- Do not remove English, Arabic, or Chinese language support.
- Do not remove the upstream DeepSeek GUI sync path.
- Use generic language such as User Agent Stack, not personal naming.
- Do not include secrets, tokens, private paths, or private config values.
- Treat every external project as a reference, benchmark, or attribution target
  only. Do not imply affiliation, endorsement, sponsorship, or code ownership.

Verification:
- git status before edits
- npm test -- src/main/product-brand.test.ts
- npm run typecheck
- Explain why a full build is or is not required for docs-only changes.
```

## Exit Criteria

- The reference intake names upstream, product compass, technical references,
  and benchmark projects without implying affiliation.
- The engine audit explains why Kun remains the kernel and what would need to
  be proven before replacing it.
- Browser/computer-control feasibility is documented as disabled-by-default,
  typed, audited, and permission-gated.

