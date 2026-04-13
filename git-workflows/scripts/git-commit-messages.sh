#!/usr/bin/env bash
# Show commit messages between an ancestor and HEAD.
# Usage: git-commit-messages.sh <ancestor>
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: git-commit-messages.sh <ancestor>" >&2
    exit 1
fi

ancestor="$1"
exec git log --format='--- commit ---%nHash: %H%nAuthor: %an%nDate: %aI%n%n%B' "$ancestor"..HEAD
