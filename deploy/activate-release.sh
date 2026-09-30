#!/usr/bin/env bash
# Called on the server. Paths are supplied by the operator, never stored in Git.
set -euo pipefail
BASE="$1"
RELEASE="$2"
[[ "$BASE" =~ ^/[a-zA-Z0-9_/-]+$ && "$BASE" != / ]] || exit 1
[[ "$RELEASE" =~ ^[0-9TZ]+-[0-9a-f]+$ ]] || exit 1
mkdir -p "$BASE/releases/$RELEASE" "$BASE/shared-assets"
tar -xzf "/tmp/ddb-tools-$RELEASE.tar.gz" -C "$BASE/releases/$RELEASE"
chmod -R a+rX "$BASE/releases/$RELEASE"
# Backfill every retained release. Content-hashed assets remain available to old tabs.
for directory in "$BASE"/releases/*/assets; do
  [[ -d "$directory" ]] || continue
  while IFS= read -r -d '' file; do
    name="${file##*/}"
    if [[ -f "$BASE/shared-assets/$name" ]]; then
      cmp -s "$file" "$BASE/shared-assets/$name" || { echo 'Asset hash collision; release aborted'; exit 1; }
    else
      cp "$file" "$BASE/shared-assets/$name"
      chmod a+r "$BASE/shared-assets/$name"
    fi
  done < <(find "$directory" -maxdepth 1 -type f -print0)
done
nginx -t
PREVIOUS="$(readlink "$BASE/current" || true)"
ln -sfn "$BASE/releases/$RELEASE" "$BASE/current.next"
mv -Tf "$BASE/current.next" "$BASE/current"
rollback() {
  if [[ -n "$PREVIOUS" ]]; then
    ln -sfn "$PREVIOUS" "$BASE/current.rollback"
    mv -Tf "$BASE/current.rollback" "$BASE/current"
  fi
}
if ! systemctl reload nginx; then rollback; exit 1; fi
# A local Host-aware smoke check can be supplied without storing private hostnames.
# Immutable assets are intentionally retained; monitor their disk usage.
