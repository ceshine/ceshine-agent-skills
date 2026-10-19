---
name: git-workflows
description: "Always invoke this skill for any git-related request (commit messages, staging review, history, PR descriptions, etc.) so git workflows are handled consistently."
---

# Git Workflows

Generate comprehensive pull request descriptions by analyzing git state: staged changes, commit history, and diffs between commits or branches.

## Git Data Scripts

Use the scripts in `scripts/` to extract git data. **Do not run raw `git diff` or `git log` commands directly** — always use these scripts to ensure consistent output and exclude patterns.

```bash
scripts/git-diff.sh [repo-root] <ancestor>         # Diff between ancestor and HEAD
scripts/git-cached-diff.sh [repo-root]             # Staged (cached) changes
scripts/git-unstaged-diff.sh [repo-root]           # Unstaged changes (working tree vs index)
scripts/git-commit-messages.sh [repo-root] <ancestor>  # Commit messages from ancestor to HEAD
```

**Always provide the target Git repository root explicitly.** Every script accepts an optional first argument that specifies the root directory of the target Git repository. When omitted it defaults to the current working directory — but relying on the default is error-prone because the agent may be `cd`'d into the skill directory or another unrelated location. Pass the repository root explicitly to guarantee the scripts operate on the correct repo. **The argument is validated with `git rev-parse --git-dir`; if a path is provided but is not a valid Git repository, the script will exit with an error rather than silently falling back to `.`:**

```bash
scripts/git-diff.sh /path/to/repo main
# NOT: cd /path/to/repo && scripts/git-diff.sh main  (avoids wrong-cwd bugs)
```

Scripts are resolved relative to this skill file's directory. Always use the absolute path of the skill directory when invoking them (e.g., `<skill-dir>/scripts/git-diff.sh` — the agent knows `<skill-dir>` as the directory containing SKILL.md).

All scripts source `common.sh`, which provides the `parse_repo_root` helper for validating and extracting the optional repo-root argument, as well as `build_exclude_args` for pathspec exclusions.

**Exclude patterns:** Files matching patterns in `scripts/excludes.conf` are excluded from diff output. Set the `GIT_SKILL_EXCLUDES` env variable (colon-separated patterns) to override. Patterns are applied with `:(exclude,glob)` pathspec magic, so `**/foo` matches at any depth **including the repository root**. To debug the exact git command a script runs (e.g., when excludes seem to have no effect), set `GIT_SKILL_DEBUG=1` — the script then echoes the shell-quoted command to stderr before executing it:

```bash
GIT_SKILL_DEBUG=1 scripts/git-cached-diff.sh /path/to/repo
```

**Non-interactive by default:** all script-driven git commands run with `--no-pager` and `GIT_TERMINAL_PROMPT=0`, so they never block on an interactive pager or a credential prompt. Override the prompt behavior explicitly with `GIT_TERMINAL_PROMPT=1` if ever needed.

## Operations

Read the reference file for an operation before starting it. Paths are relative to this skill's directory.

1. **Review Changes** — Code review of staged (1a), unstaged (1b), or cross-commit (1c) diffs. Read `references/op_review.md`, plus `references/general_code_review_guidelines.md` and any language-specific guidelines that apply (`references/python_code_review_guidelines.md`, `references/rust_code_review_guidelines.md`).
2. **Generate Commit Message Summary** — Summarize commit history from a given ancestor (see below).
3. **Generate Commit Message for Staged Changes** — Draft a conventional commit message for staged changes, with an optional review step. Read `references/op_commit_message.md`.
4. **Create Pull Request Description** — Compose a structured PR body from diffs and commits. Read `references/op_pr_description.md`.
5. **Auto-Commit Unstaged Changes** — Classify, group, and commit unstaged changes automatically. Read `references/auto_commit_workflow.md`.

To stage only part of a file's changes (used by operation 5 and by skills that fix review findings), read `references/partial_staging.md`.

### 2. Generate Commit Message Summary

Extract commit messages to understand the history:

`scripts/git-commit-messages.sh <repo-root> <commit-or-branch>`

Returns commit hashes and messages, useful for:

- Understanding changes across multiple commits
- Identifying key features/bug fixes
- Creating a changelog-style summary

## Error Handling

If a script fails:

- Verify the `<repo-root>` argument points to a valid Git repository (`git -C <repo-root> rev-parse --git-dir`)
- Check the ancestor ref exists (commit hash or branch name)
- Ensure the scripts are executable (`chmod +x scripts/*.sh`)
