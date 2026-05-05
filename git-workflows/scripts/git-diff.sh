#!/usr/bin/env bash
# Show the diff between an ancestor commit/branch and HEAD.
# Usage: git-diff.sh [repo-root] <ancestor>
set -euo pipefail
source "$(dirname "$0")/common.sh"

parse_repo_root "$@"
[[ "$REPO_ROOT" != "." ]] && shift

if [[ $# -lt 1 ]]; then
    echo "Usage: git-diff.sh [repo-root] <ancestor>" >&2
    exit 1
fi

ancestor="$1"
build_exclude_args
exec git -C "$REPO_ROOT" diff "$ancestor"..HEAD "${EXCLUDE_ARGS[@]}"
