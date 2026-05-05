#!/usr/bin/env bash
# Show unstaged changes (working tree vs index).
# Usage: git-unstaged-diff.sh [repo-root]
set -euo pipefail
source "$(dirname "$0")/common.sh"

parse_repo_root "$@"
[[ "$REPO_ROOT" != "." ]] && shift

build_exclude_args
exec git -C "$REPO_ROOT" diff "${EXCLUDE_ARGS[@]}"
