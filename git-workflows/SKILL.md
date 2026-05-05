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

**Always provide the target Git repository root explicitly.** Every script accepts an optional first argument that specifies the root directory of the target Git repository. When omitted it defaults to the current working directory — but relying on the default is error-prone because the agent may be `cd`'d into the skill directory or another unrelated location. Pass the repository root explicitly to guarantee the scripts operate on the correct repo. The argument is validated with `git rev-parse --git-dir` so any path that is not a valid Git repository will be ignored (falling back to `.`):

```bash
scripts/git-diff.sh /path/to/repo main
# NOT: cd /path/to/repo && scripts/git-diff.sh main  (avoids wrong-cwd bugs)
```

Scripts are resolved relative to this skill file's directory. Always use the absolute path of the skill directory when invoking them (e.g., `<skill-dir>/scripts/git-diff.sh` — the agent knows `<skill-dir>` as the directory containing SKILL.md).

All scripts source `common.sh`, which provides the `parse_repo_root` helper for validating and extracting the optional repo-root argument, as well as `build_exclude_args` for pathspec exclusions.

**Exclude patterns:** Files matching patterns in `scripts/excludes.conf` are excluded from diff output. Set the `GIT_SKILL_EXCLUDES` env variable (colon-separated patterns) to override.

## Building Blocks

- Code Review Tasks (**Always read these files if you are performing any kind of code review task**):
  - Read `references/general_code_review_guidelines.md` for the general guidelines.
  - Read `references/python_code_review_guidelines.md` if you are reviewing Python code.
  - Read `references/rust_code_review_guidelines.md` if you are reviewing Rust code.
- Auto-Commit Workflow:
  - Read `references/auto_commit_workflow.md` for the grouping algorithm and step-by-step process.

## Operations

1. **Review Changes** — Code review of staged, unstaged, or cross-commit diffs
2. **Generate Commit Message Summary** — Summarize commit history from a given ancestor
3. **Generate Commit Message for Staged Changes** — Draft a conventional commit message for staged changes
4. **Create Pull Request Description** — Compose a structured PR body from diffs and commits
5. **Auto-Commit Unstaged Changes** — Classify, group, and commit unstaged changes automatically

### 1. Review Changes

**Read the appropriate reference files for code review tasks (see Building Blocks above) before proceeding.** Then choose the appropriate sub-operation based on the user's request:

#### 1a. Review Staged Changes

Review modifications that have been staged (added to the index) but not yet committed:

1. Get cached changes: `scripts/git-cached-diff.sh <repo-root>` (where `<repo-root>` is the absolute path to the target repository)
2. Follow the code review guidelines to evaluate changes

#### 1b. Review Unstaged Changes

Review modifications in the working directory that have not yet been staged:

1. Get unstaged changes: `scripts/git-unstaged-diff.sh <repo-root>`
2. Follow the code review guidelines to evaluate changes

#### 1c. Review Changes Between Two Commits

Review the diff introduced between any two commits, branches, or refs:

1. Identify the two refs (e.g., `HEAD~3` and `HEAD`, or `main` and a feature branch).
2. Get the diff: `scripts/git-diff.sh <repo-root> <base-ref>` (compares base-ref to HEAD).
3. Optionally gather the commit messages: `scripts/git-commit-messages.sh <repo-root> <base-ref>` to understand the intent behind the changes.
4. Follow the code review guidelines to evaluate changes

---

Present findings clearly, distinguishing between blocking issues and optional suggestions.

### 2. Generate Commit Message Summary

Extract commit messages to understand the history:

`scripts/git-commit-messages.sh <repo-root> <commit-or-branch>`

Returns commit hashes and messages, useful for:

- Understanding changes across multiple commits
- Identifying key features/bug fixes
- Creating a changelog-style summary

### 3. Generate Commit Message for Cached/Staged Changes

Create a descriptive commit message based on staged changes through an iterative review process:

1. **Review staged changes** - Read `references/general_code_review_guidelines.md` (and any language-specific guidelines), then perform a code review using the process described in the "1a. Review Staged Changes" section.
2. **Present findings and wait for feedback** - Show issues and suggestions to user. User may:
  - Edit the staged changes
  - Acknowledge issues if any but proceed
  - Ask for clarification
  - Or simply confirm they have reviewed the findings and approve moving on
  **Only move on to the the next step after an explicit approval from the user**.
3. **Load history** - Load the three most recent commit messages (e.g., `scripts/git-commit-messages.sh <repo-root> HEAD~3`) to ensure historical context.
4. **Draft the commit message** - write it to `{cwd}/cache/commit_message.txt` in the conventional commit format (`{cwd}` is the directory in which the agent was invoked; first remove the file if it already exists, then write to it):
   ```
   <type>(<scope>): <subject>

   <body>

   Commit message generated by <your name>
   ```
  - Type: feat, fix, docs, style, refactor, test, chore
  - Scope: (optional) the area of code affected
  - Description: brief explanation of changes
  - Body: itemized details of changes. Highlight breaking changes or issue references
  - Footer: Ask the user what your name is if uncertain. The should be in the format: `<harness name> (<model name>)` (e.g., `Claude Code (Sonnet 4.6)`)
5. **Display the commit message** - User may:
  - Request revision
  - Approve the commit message -> Commit the changes with the message and end the process.

### 4. Create Pull Request Description

Use the diff and recent commits to compose a structured PR body:

1. Collect the diff for the target branch, preferably against the base (e.g., `origin/main`).
2. Gather its commit messages to capture intent and progression.
3. Extract:
   - **Summary**: A concise paragraph (1-2 sentences) describing the overall intent of the branch.
   - **Key Changes**: Bullet list that highlights the most important file edits or feature additions.
   - **Commit History**: Chronological list of commits (hash + message) so reviewers can trace the work.

Format suggestions:
```markdown
## Summary
[Commit-driven overview]

## Key Changes
- `[File]`: [Primary modification]
- ...
```

#### Workflow Notes

- Identify the merge base (usually `origin/main` or `main`).
- Run `scripts/git-diff.sh <repo-root> origin/main` and `scripts/git-commit-messages.sh <repo-root> origin/main` to gather the data.
- Parse and organize the collected information into the sections above before sharing with the user.

### 5. Auto-Commit Unstaged Changes

Automatically analyze, group, and commit unstaged changes into organized conventional commits.

**Read `references/auto_commit_workflow.md` for the full workflow.** Summary:

1. **Precondition** — Verify no staged changes exist; stop and ask the user to clear them if found.
2. **Collect** — Gather unstaged diff and untracked files.
3. **Classify, group & present plan** — Parse changes into commit groups by type and scope. Show proposed groups. **Only proceed after explicit user approval.**
4. **Execute** — Stage and commit each group with a conventional commit message.
5. **Report** — Summarize all created commits.

## Error Handling

If a script fails:

- Verify the `<repo-root>` argument points to a valid Git repository (`git -C <repo-root> rev-parse --git-dir`)
- Check the ancestor ref exists (commit hash or branch name)
- Ensure the scripts are executable (`chmod +x scripts/*.sh`)
