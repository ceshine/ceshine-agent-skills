#!/usr/bin/env bash
# Show unstaged changes (working tree vs index).
# Usage: git-unstaged-diff.sh
set -euo pipefail
source "$(dirname "$0")/common.sh"

build_exclude_args
exec git diff "${EXCLUDE_ARGS[@]}"
