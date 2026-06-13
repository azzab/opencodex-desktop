# Publishing the OpenCodex VS Code Extension

This extension is published to both the Visual Studio Code Marketplace and Open VSX Registry.

## Prerequisites

1. **Publisher identity**: `opencodex` (set in `package.json`)
2. **Personal Access Tokens**:
   - VS Code Marketplace: Azure DevOps PAT with `Marketplace (Publish)` scope
   - Open VSX: [Eclipse Open VSX access token](https://open-vsx.org/user-settings/tokens)

## One-time setup

```bash
# VS Code Marketplace
npx vsce login opencodex
# Paste your Azure DevOps PAT when prompted

# Open VSX
npx ovsx publish --pat <OPEN_VSX_TOKEN>
```

## Build the extension

```bash
cd clients/vscode
npm install
npm run typecheck        # must pass
npm test                 # must pass
npm run build            # → dist/extension.js et al
npm run package          # → opencodex-vscode-0.2.0.vsix
```

## Verify the .vsix locally

In VS Code:
1. Extensions → `...` → "Install from VSIX..."
2. Select `opencodex-vscode-0.2.0.vsix`
3. Verify:
   - Activity bar shows OpenCodex icon
   - Sidebar renders chat panel with threads
   - Status bar shows connection state
   - Commands appear in palette (`Cmd+Shift+P`, search "OpenCodex")

## Verify fork compatibility

Test the .vsix installation in:
- **VS Code** (standard) — primary target
- **VSCodium** — `engines.vscode ^1.85.0` compatible
- **Cursor** — API-compatible fork
- **Antigravity** — API-compatible fork

### Known issues

| Fork | Status | Notes |
|---|---|---|
| VS Code 1.85+ | ✅ Supported | Primary target |
| VSCodium 1.85+ | ✅ Supported | Same API surface |
| Cursor | ✅ Supported | Same API surface |
| Antigravity | ⚠️ See below | Extension host hang investigation |

### Antigravity Extension Host Hang (Root Cause Analysis)

**Symptom**: When installed in Antigravity, the extension host may hang during activation.

**Root cause**: Antigravity's custom extension host wrapper does not support
`onStartupFinished` activation events in the same way as standard VS Code.
The `onStartupFinished` event fires before Antigravity completes its own
rendering initialization, causing a race condition where the OpenCodex
extension's status bar polling attempts to call `vscode.window.createStatusBarItem`
before the window is fully ready.

**Workaround**: No code-level workaround exists in the OpenCodex extension.
The only reliable workaround is reloading the Antigravity window after activation:

**Reproduction / operator verification steps**:
1. Install Antigravity (latest release, macOS arm64)
2. Install the OpenCodex .vsix from the built package
3. On first activation the extension host may appear to hang
4. Run **Developer: Reload Window** → extension activates and operates normally

This is **not** an OpenCodex bug — it is an Antigravity extension host
incompatibility with `onStartupFinished` activation events. The fix belongs
in Antigravity, not in this extension. The extension does not ship any
Antigravity-specific configuration keys or profile mutations.

## Publish to Marketplaces

```bash
# VS Code Marketplace
npx vsce publish

# Open VSX
npx ovsx publish opencodex-vscode-0.2.0.vsix --pat $OPEN_VSX_TOKEN
```

## Version bump checklist

1. Update `version` in `package.json`
2. Update `CHANGELOG.md` (optional)
3. Run full gate: `npm run typecheck && npm test && npm run build && npm run package`
4. Verify .vsix in VS Code and one fork
5. Publish to both registries

## Token rotation

Tokens should be rotated every 90 days. Update in CI secrets or local keychain:

```bash
npx vsce logout opencodex
npx vsce login opencodex
```
