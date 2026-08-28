#!/usr/bin/env bash
# Shared helpers for git-workflows scripts.
# Source this file; do not execute it directly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse the optional leading repo-root argument from positional parameters.
# If $1 is a valid Git repository, sets REPO_ROOT to that path.
# If $1 is provided but is NOT a valid Git repository, the script exits with an error.
# If no argument is given, defaults to "." (must be a Git repo at runtime).
# Callers should shift only when REPO_ROOT was consumed:
#   parse_repo_root "$@"
#   [[ "$REPO_ROOT" != "." ]] && shift
parse_repo_root() {
    REPO_ROOT="."
    if [[ $# -gt 0 ]]; then
        if git -C "$1" rev-parse --git-dir >/dev/null 2>&1; then
            REPO_ROOT="$1"
        else
            echo "error: '$1' is not a valid Git repository" >&2
            exit 1
        fi
    fi
}

# Build pathspec exclude arguments from GIT_SKILL_EXCLUDES or excludes.conf.
# Populates the EXCLUDE_ARGS array.
#
# Patterns are emitted with the long-form magic ':(exclude,glob)':
#   - ':(exclude)' (not the ':!' shorthand) avoids shell history-expansion and
#     environment escaping hazards around '!' (e.g. some shells/tools rewrite
#     ':!foo' into ':\!foo', which git then treats as a literal pathname and
#     silently matches nothing).
#   - glob magic makes '**/' match at ANY depth INCLUDING the repository root
#     (plain pathspec '**/foo' does not match a root-level 'foo').
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
            EXCLUDE_ARGS+=(":(exclude,glob)${pattern}")
        done
    fi
}

# Run git non-interactively, echoing the exact command (shell-quoted) to
# stderr first when GIT_SKILL_DEBUG is set. Intended for debugging
# exclude/pathspec issues:
#   GIT_SKILL_DEBUG=1 scripts/git-cached-diff.sh /path/to/repo
#
# Non-interactive by default:
#   - --no-pager: never invoke an interactive pager (e.g. `less`) that would
#     block waiting for input.
#   - GIT_TERMINAL_PROMPT=0: never prompt on the terminal (e.g. credential
#     prompts). Override explicitly with GIT_TERMINAL_PROMPT=1 if needed.
run_git() {
    if [[ -n "${GIT_SKILL_DEBUG:-}" ]]; then
        printf 'git --no-pager' >&2
        for a in "$@"; do printf ' %q' "$a" >&2; done
        printf '\n' >&2
    fi
    exec env GIT_TERMINAL_PROMPT="${GIT_TERMINAL_PROMPT:-0}" git --no-pager "$@"
}
