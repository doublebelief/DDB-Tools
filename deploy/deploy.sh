#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DEPLOY_TARGET:?Set DEPLOY_TARGET to your SSH host alias or user@host}"
: "${DEPLOY_ROOT:?Set DEPLOY_ROOT to the private absolute deployment directory}"
[[ "$DEPLOY_TARGET" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$ ]] || { echo 'Invalid SSH target'; exit 1; }
[[ "$DEPLOY_ROOT" =~ ^/[a-zA-Z0-9_/-]+$ && "$DEPLOY_ROOT" != / ]] || { echo 'Invalid deployment directory'; exit 1; }
RELEASE="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
npm ci
npm test
npm run test:ui
npm run build
ARCHIVE="$(mktemp -t ddb-tools.XXXXXX)"
trap 'rm -f "$ARCHIVE"' EXIT
# Python avoids platform-specific tar metadata and includes only public build output.
python3 - "$ARCHIVE" <<'PY'
import sys,tarfile
with tarfile.open(sys.argv[1], 'w:gz') as archive:
    archive.add('dist', arcname='.')
PY
scp "$ARCHIVE" "$DEPLOY_TARGET:/tmp/ddb-tools-$RELEASE.tar.gz"
ssh "$DEPLOY_TARGET" bash -s -- "$DEPLOY_ROOT" "$RELEASE" < deploy/activate-release.sh
printf 'Deployment complete.\n'
