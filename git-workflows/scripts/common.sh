#!/usr/bin/env bash
# Shared helpers for git-workflows scripts.
# Source this file; do not execute it directly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build pathspec exclude arguments from GIT_SKILL_EXCLUDES or excludes.conf.
# Populates the EXCLUDE_ARGS array.
build_exclude_args() {
    EXCLUDE_ARGS=()
    local patterns=()

    if [[ -n "${GIT_SKILL_EXCLUDES:-}" ]]; then
        # Env variable: colon-separated patterns
        IFS=':' read -ra patterns <<< "$GIT_SKILL_EXCLUDES"
    elif [[ -f "$SCRIPT_DIR/excludes.conf" ]]; then
        # Config file: one pattern per line, skip comments and blanks
        while IFS= read -r line; do
            line="${line%%#*}"       # strip inline comments
            line="${line#"${line%%[![:space:]]*}"}"  # trim leading space
            line="${line%"${line##*[![:space:]]}"}"  # trim trailing space
            [[ -z "$line" ]] && continue
            patterns+=("$line")
        done < "$SCRIPT_DIR/excludes.conf"
    fi

    if [[ ${#patterns[@]} -gt 0 ]]; then
        EXCLUDE_ARGS+=("--")
        for pattern in "${patterns[@]}"; do
            EXCLUDE_ARGS+=(":!${pattern}")
        done
    fi
}
