#!/usr/bin/env bash
# Show commit messages between an ancestor and HEAD.
# Usage: git-commit-messages.sh [repo-root] <ancestor>
set -euo pipefail
source "$(dirname "$0")/common.sh"

parse_repo_root "$@"
[[ "$REPO_ROOT" != "." ]] && shift

if [[ $# -lt 1 ]]; then
    echo "Usage: git-commit-messages.sh [repo-root] <ancestor>" >&2
    exit 1
fi

ancestor="$1"
exec git -C "$REPO_ROOT" log --format='--- commit ---%nHash: %H%nAuthor: %an%nDate: %aI%n%n%B' "$ancestor"..HEAD
