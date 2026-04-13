#!/usr/bin/env bash
# Show staged (cached) changes.
# Usage: git-cached-diff.sh
set -euo pipefail
source "$(dirname "$0")/common.sh"

build_exclude_args
exec git diff --cached "${EXCLUDE_ARGS[@]}"
