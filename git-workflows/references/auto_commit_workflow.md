# Auto-Commit Unstaged Changes — Workflow

Analyze unstaged working-tree changes, group them into logical commits by change type and scope, and execute each commit with a conventional commit message.

## Preconditions

Run these checks before starting:

1. **No staged changes**: Run `git diff --cached --stat`. If output is non-empty, **STOP** and tell the user:
   > "There are staged changes present. Please commit, stash, or unstage them before using auto-commit. This operation needs full control of the staging area."
2. **Changes exist**: Run `git diff --stat` and `git ls-files --others --exclude-standard`. If both are empty, inform the user there is nothing to commit.

## Human-in-the-Loop Checkpoints

This workflow modifies git history through `git commit`, which is **destructive** — commits are difficult to undo cleanly once created. The agent **must not** proceed past a checkpoint without explicit user approval.

### Mandatory checkpoints

| Checkpoint | When | What to present | Allowed responses |
|------------|------|-----------------|-------------------|
| **Commit plan approval** (Step 3) | After classifying and grouping all changes | The full proposed commit table with files/hunks per group | Approve, modify groupings, exclude files, abort |
| **Per-commit message review** (Step 4d) | Before each `git commit` execution | The composed commit message | Approve, request revision |

### Rules

1. **Never batch approvals.** Each checkpoint requires its own explicit approval. A user approving the commit plan does **not** imply approval of individual commit messages.
2. **Silence is not consent.** If the user's response is ambiguous (e.g., "okay" without specifying which action), ask for clarification rather than proceeding.
3. **Abort at any time.** If the user says stop, cancel, or abort at any point, immediately clean up (`git reset HEAD` if anything is staged) and report which commits, if any, were already completed.
4. **Surface surprises early.** If the agent encounters anything unexpected during execution (e.g., staging area not clean, hunk counts don't match), pause and inform the user before continuing — do not attempt to self-correct silently.

## Step 1: Collect Changes

Gather two sets of data:

- **Modified/deleted files**: `git-unstaged-diff()` or `git diff` (full patch output)
- **Untracked files**: `git ls-files --others --exclude-standard`
- **Rename detection**: `git diff -M --diff-filter=R --name-status`

For untracked files, read their content to understand purpose and classify them alongside the rest.

## Step 2: Classify and Group Changes

Classify each change by **type** and **scope**, then group them into commit-sized units.

### Classification Reference

**Change types** (conventional commit types):

| Type       | Criteria                                                              |
|------------|-----------------------------------------------------------------------|
| `feat`     | New functionality, new endpoints, new user-facing behavior            |
| `fix`      | Bug corrections, error handling fixes                                 |
| `refactor` | Code restructuring with no behavior change (renames, extractions)     |
| `docs`     | Documentation-only changes (README, docstrings, comments)             |
| `style`    | Formatting, whitespace, linting fixes (no logic change)               |
| `test`     | Adding or modifying tests                                             |
| `chore`    | Build config, CI, dependencies, tooling, gitignore                    |

**Scope** — derive from the logical area the change affects:

1. Single module/package/directory → use that name (e.g., `auth`, `api`, `cli`)
2. Single file that is a clear entity → use the entity name (e.g., `config`, `readme`)
3. Multiple related files in the same feature area → use the feature name
4. Unclear or too broad → omit scope

### Pass 1 — File-level grouping

For each file, read the diff and determine whether **all hunks serve one type+scope**. If so, assign the whole file to that group. This covers the majority of files.

### Pass 2 — Hunk-level splitting

For files where hunks serve **different purposes** (e.g., a bug fix on line 20 and a new feature on line 80):

1. **Read each hunk individually** and assign it a type+scope. A single file may contribute hunks to multiple commit groups.
2. **Record hunk identifiers** for each group. Use the hunk header line (`@@ -start,count +start,count @@`) as the identifier. Example:
   ```
   Group "fix(auth)":   src/auth/token.py → hunks @@ -15,8 +15,10 @@, @@ -42,5 +44,7 @@
   Group "style(auth)": src/auth/token.py → hunk  @@ -30,3 +30,3 @@
   ```
3. **Check for hunk dependencies**: If hunk B modifies lines that hunk A introduces or changes in the same file, they should be in the same commit group (or group A must be committed first). Flag these dependencies during planning.
4. **Prefer whole-file staging when the split is marginal.** If a file has 5 hunks and 4 belong to one group, consider whether the 1 outlier is significant enough to warrant the complexity of partial staging. If it is trivial (e.g., a whitespace change), merge it into the dominant group.

### Pass 3 — Consolidation and ordering

- **Merge small groups**: If two groups share the same type and have closely related scopes, merge them. Prefer fewer cohesive commits over many tiny ones. A single-line whitespace fix should join a nearby `style` commit.
- **Order commits** for execution:
  1. `chore` (infrastructure first)
  2. `docs`
  3. `style`
  4. `refactor`
  5. `test`
  6. `fix`
  7. `feat` (new features last — they may depend on the above)

### Special Cases

- **Binary files**: Group by file path/purpose. Note them in the commit body but do not analyze content.
- **Renamed files**: Classify as `refactor` unless the rename accompanies functional changes. Stage both old and new paths.
- **Deleted files**: Classify by reason — cleanup = `chore`, removing dead code = `refactor`. Stage with `git rm`.
- **Large diffs** (>500 lines in a single file): Flag to the user and ask whether it should be its own commit.
- **Config/lock files** (`.toml`, `.json`, `.yaml`, `.lock`): Default to `chore` unless they clearly support a `feat` or `fix`.

## Step 3: Present the Commit Plan

Display the proposed groupings as a numbered table:

```
## Proposed Commit Plan

| #  | Commit Message                          | Files / Hunks                  |
|----|-----------------------------------------|--------------------------------|
| 1  | chore(deps): update dependency locks    | Cargo.lock, pyproject.toml     |
| 2  | fix(auth): handle expired token refresh | src/auth/token.py (hunks 1,3) |
| 3  | feat(api): add user search endpoint     | src/api/search.py (new file)  |
|    |                                         | src/api/routes.py (hunk 2)    |

### Mixed-file staging notes
- `src/auth/token.py`: Hunk 2 (style fix) → commit #4
- `src/api/routes.py`: Hunk 1 (import cleanup) → commit #4

### Excluded files (if any)
- assets/logo.png — binary, included in commit #3
```

**Wait for the user to:**
- **Approve** the plan as-is
- **Modify** groupings (merge, split, reorder, re-classify)
- **Exclude** specific files or hunks
- **Abort** the entire operation

**Only proceed after explicit approval.**

## Step 4: Execute Commits

For each approved group, in order:

### 4a. Verify clean staging area

Run `git diff --cached --stat`. Must be empty. If not, **STOP** — something went wrong.

### 4b. Stage the relevant changes

- **Whole files**: `git add <file1> <file2> ...`
- **Deleted files**: `git rm <file>`
- **Untracked files**: `git add <file>`
- **Specific hunks** (partial file staging) — use patch-based staging:

  **Procedure:**
  1. Extract the full diff for the file:
     ```bash
     git diff <file> > ./cache/full_patch.patch
     ```
  2. Read the patch and identify which hunks belong to this commit group (by matching the `@@` headers recorded in Pass 2).
  3. Write a new patch file containing **only** the target hunks. The file must include:
     - The patch header lines (`diff --git`, `index`, `---`, `+++`)
     - Only the `@@ ... @@` hunk sections assigned to this group
     - All context lines (lines starting with a space) within those hunks — do not strip them
  4. Apply the filtered patch to the index:
     ```bash
     git apply --cached ./cache/target_hunks.patch
     ```
  5. If `git apply` fails (e.g., context mismatch), try with `--3way` flag as a fallback. If that also fails, inform the user and ask for guidance.

  **Important:** After committing hunks from a file in one group, the working-tree diff for that file changes (the committed hunks are no longer in the diff). Re-extract the diff (`git diff <file>`) before staging hunks from the same file for a subsequent group.

### 4c. Verify staging matches plan

Run `git diff --cached --stat` and confirm only the intended files/hunks are staged.

### 4d. Compose the commit message

Follow conventional commit format:

```
<type>(<scope>): <subject>

<body — itemized list of what changed>

Commit message generated by <agent name>
```

- Subject: imperative mood, lowercase, no trailing period, max 72 chars
- Body: list the specific changes in this group
- Load the two most recent commit messages (`git log -2 --format=%B`) for style reference
- Write the message to `./cache/commit_message.txt` (remove first if it exists)

Display the message. The user may **approve** or **request revision**.

### 4e. Commit

```bash
git commit -F ./cache/commit_message.txt
```

Confirm success with `git log -1 --oneline` and display.

### 4f. Proceed to next group or finish

Repeat from 4a for the next group.

## Step 5: Final Report

After all commits, display a summary:

```
## Auto-Commit Summary

Created N commits:

| # | Hash    | Message                                |
|---|---------|----------------------------------------|
| 1 | abc1234 | chore(deps): update dependency locks   |
| 2 | def5678 | fix(auth): handle expired token refresh|
| 3 | ghi9012 | feat(api): add user search endpoint    |
```

List any skipped or excluded files.

## Error Handling

| Scenario | Action |
|----------|--------|
| **Staging area contaminated mid-workflow** | Run `git reset HEAD` to unstage everything. Inform the user and ask whether to retry or abort. |
| **Commit fails** (e.g., pre-commit hook) | Show the error. Ask user whether to fix and retry, or skip this group. |
| **Hunk staging produces unexpected results** | Show `git diff --cached` output. Ask user for guidance. |
| **User wants to stop mid-workflow** | Run `git reset HEAD` to clean up any partially staged changes. Report which commits were already completed. |
