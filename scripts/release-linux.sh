#!/usr/bin/env bash
#
# Linux release: build AppImage and optionally upload to an existing
# GitHub release tag.  Same tag is created by release-mac.sh on macOS.
#
# Usage:
#   ./scripts/release-linux.sh -t v0.3.1
#   ./scripts/release-linux.sh -t v0.3.1 -p    # also upload to GitHub
#   ./scripts/release-linux.sh -t v0.3.1 -c stable -r -pr  # R2 upload + promote
#
# npm:
#   npm run release:linux -- -t v0.3.1

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG=""
CHANNEL=""
DO_PUBLISH="false"
DO_R2="false"
DO_PROMOTE_R2="false"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release-linux.sh -t <tag> [-c stable|frontier] [-p] [-r] [-pr]

  -t TAG        Required. Release tag (e.g. v0.3.1)
  -c CHANNEL    Release channel (stable or frontier). Default: frontier
  -p            Publish the GitHub release (un-draft it)
  -r            Upload artifact metadata to R2
  -pr           Promote R2 latest pointer to this tag
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -t) TAG="$2"; shift 2 ;;
    -c) CHANNEL="$2"; shift 2 ;;
    -p) DO_PUBLISH="true"; shift ;;
    -r) DO_R2="true"; shift ;;
    -pr) DO_PROMOTE_R2="true"; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown flag: $1"; usage ;;
  esac
done

if [[ -z "$TAG" ]]; then
  echo "[ERROR] -t TAG is required"
  usage
fi

if [[ ! "$TAG" =~ ^v ]]; then
  TAG="v${TAG}"
fi

RELEASE_VERSION="${TAG#v}"
if [[ ! "$RELEASE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "[ERROR] Release tag must be vX.Y.Z.  Got: $TAG"
  exit 1
fi

# Load local release env for R2 creds etc.
for candidate in \
  "${OPENCODEX_DESKTOP_RELEASE_ENV:-}" \
  "${DEEPSEEK_GUI_RELEASE_ENV:-}" \
  "${ROOT}/scripts/release.local.env" \
  "${ROOT}/release.local.env"
do
  if [[ -n "$candidate" && -f "$candidate" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$candidate"
    set +a
    echo "[info] Loaded release env: $candidate"
    break
  fi
done

: "${RELEASE_CHANNEL:=${OPENCODEX_DESKTOP_UPDATE_CHANNEL:-${DEEPSEEK_GUI_UPDATE_CHANNEL:-frontier}}}"
CHANNEL="${CHANNEL:-$RELEASE_CHANNEL}"

if [[ "$CHANNEL" != "stable" && "$CHANNEL" != "frontier" ]]; then
  echo "[ERROR] Release channel must be stable or frontier.  Got: $CHANNEL"
  exit 1
fi

export OPENCODEX_DESKTOP_APP_VERSION="$RELEASE_VERSION"
export RELEASE_CHANNEL="$CHANNEL"
export OPENCODEX_DESKTOP_UPDATE_CHANNEL="$CHANNEL"

echo "[info] GitHub release tag: $TAG"
echo "[info] Release channel:     $CHANNEL"

# Check that the tag exists
if ! gh release view "$TAG" &>/dev/null; then
  echo "[ERROR] GitHub release $TAG not found — run release-mac.sh on macOS first."
  exit 1
fi

# Clean old artifacts
rm -f \
  "$ROOT/dist/OpenCodex-Desktop-"*"-linux-"* \
  "$ROOT/dist/OpenCodex Desktop-"*"-linux-"* \
  "$ROOT/dist/latest-linux.yml" \
  "$ROOT/dist/"*".blockmap"

# Rebuild native modules for Electron ABI
echo "[info] Rebuilding native modules for Electron..."
node "$ROOT/scripts/electron-rebuild-native.cjs" electron

# Build the Linux AppImage
echo "[info] Building Linux AppImage..."
npm run dist:linux

# Verify artifacts
shopt -s nullglob
APPIMAGE_FILES=("$ROOT/dist/OpenCodex-Desktop-$RELEASE_VERSION-linux-x86_64.AppImage")
BLOCKMAP_FILES=("$ROOT/dist/OpenCodex-Desktop-$RELEASE_VERSION-linux-x86_64.AppImage.blockmap")

if [[ ${#APPIMAGE_FILES[@]} -eq 0 ]]; then
  echo "[ERROR] No AppImage found in dist/"
  ls -la "$ROOT/dist/" || true
  exit 1
fi

echo "[ok] AppImage: $(basename "${APPIMAGE_FILES[0]}")"
for f in "${BLOCKMAP_FILES[@]}"; do
  echo "[ok] Blockmap: $(basename "$f")"
done

# Restore Node ABI for local dev
echo "[info] Restoring Node ABI..."
node "$ROOT/scripts/electron-rebuild-native.cjs" node

# Upload to GitHub if requested
if [[ "$DO_PUBLISH" == "true" || "$DO_R2" == "true" || "$DO_PROMOTE_R2" == "true" ]]; then
  ASSETS=()
  for f in "${APPIMAGE_FILES[@]}" "${BLOCKMAP_FILES[@]}"; do
    if [[ -f "$f" ]]; then
      ASSETS+=("$f")
    fi
  done

  echo "[info] Uploading ${#ASSETS[@]} file(s) to $TAG..."
  for asset in "${ASSETS[@]}"; do
    echo "  → $(basename "$asset")"
    gh release upload "$TAG" "$asset" --clobber
  done
fi

# R2
if [[ "$DO_R2" == "true" || "$DO_PROMOTE_R2" == "true" ]]; then
  echo "[info] Uploading Linux asset metadata to R2 ($TAG)..."
  node "$ROOT/scripts/publish-r2.mjs" upload --platform linux --tag "$TAG" --channel "$CHANNEL"
fi

if [[ "$DO_PROMOTE_R2" == "true" ]]; then
  echo "[info] Promoting $TAG as R2 latest..."
  node "$ROOT/scripts/publish-r2.mjs" promote --tag "$TAG" --channel "$CHANNEL"
fi

if [[ "$DO_PUBLISH" == "true" ]]; then
  echo "[info] Publishing release $TAG..."
  gh release edit "$TAG" --draft=false
  echo "[ok] Release $TAG is now public."
else
  echo "[info] Release remains draft. Re-run with -p when ready."
fi

echo "[ok] Linux assets ready for $TAG."
