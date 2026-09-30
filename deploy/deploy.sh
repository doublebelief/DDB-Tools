#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${DEPLOY_TARGET:-deploy@example.invalid}"
RELEASE="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
[[ "$RELEASE" =~ ^[0-9TZ]+-[0-9a-f]+$ ]] || exit 1
npm ci
npm test
npm run test:ui
npm run build
ARCHIVE="$(mktemp -t ddb-tools.XXXXXX)"
trap 'rm -f "$ARCHIVE"' EXIT
tar -czf "$ARCHIVE" -C dist .
scp "$ARCHIVE" "$TARGET:/tmp/ddb-tools-$RELEASE.tar.gz"
ssh "$TARGET" "set -eu; mkdir -p /srv/example-toolbox/releases/$RELEASE; tar -xzf /tmp/ddb-tools-$RELEASE.tar.gz -C /srv/example-toolbox/releases/$RELEASE; chmod -R a+rX /srv/example-toolbox/releases/$RELEASE; ln -sfn /srv/example-toolbox/releases/$RELEASE /srv/example-toolbox/current.next; mv -Tf /srv/example-toolbox/current.next /srv/example-toolbox/current; nginx -t; systemctl reload nginx"
printf 'Deployed %s\n' "$RELEASE"
