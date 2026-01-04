---
name: git-workflow
description: "Use when the user wants to interact with the local Git repository. Perform operations on local Git repositories: review staged changes, generate commit messages, examine commit history, create pull request descriptions, and more. (This skill will be expanded to cover additional Git workflows.)"
---

# Git Workflow

Generate comprehensive pull request descriptions by analyzing git state: staged changes, commit history, and diffs between commits or branches.

## Tool Selection

Try tools with these stems in their names first. Fall back to bash if unavailable (see Error Handling section for procedure):

**MCP tools (preferred):**
- `git_diff(ancestor)` - Get diff from ancestor commit/branch to HEAD
- `git_cached_diff()` - Get staged (cached) changes
- `git_commit_messages(ancestor)` - Get commit messages from ancestor to HEAD

**Bash fallbacks:**
```bash
git diff <ancestor>..HEAD              # Diff between ancestor and HEAD
git diff --cached                      # Staged changes only
git log --oneline <ancestor>..HEAD     # Commit messages from ancestor to HEAD
```

## Operations

### 1. Review Staged Changes

Perform a code review of staged modifications:

1. Get cached changes: `git_cached_diff()` or `git diff --cached`
2. Analyze the diff for:
   - **Syntax errors**: Missing semicolons, brackets, or typos
   - **Logic issues**: Broken conditions, off-by-one errors, null reference risks
   - **Security concerns**: Hardcoded secrets, SQL injection vectors, XSS patterns
   - **Code quality**: Deeply nested blocks, duplicated code, overly complex functions
   - **Missing pieces**: Unhandled edge cases, incomplete error handling
   - **Style inconsistencies**: Deviation from project's coding conventions
3. Summarize findings:
   - Critical issues that should block the commit
   - Suggestions for improvement
   - Questions for the author

Present findings clearly, distinguishing between blocking issues and optional suggestions.

### 2. Generate Commit Message for Cached Changes

Create a descriptive commit message based on staged changes through an iterative review process:

**Iterative Workflow:**

1. **Review staged changes** - Perform code review using section 1
2. **Present findings** - Show issues and suggestions to user
3. **Wait for user** - User may:
   - Edit the staged changes
   - Acknowledge issues but proceed
   - Ask for clarification
4. **Repeat review** - If user modified changes, review again
5. **Generate commit message** - Only after user approves

**Generate Commit Message:**

1. Get cached changes: `git_cached_diff()` or `git diff --cached`
2. Analyze the diff to identify:
   - What files changed
   - What type of changes (add, modify, delete)
   - Key modifications in the code
3. Write to `cache/commit_message.txt` in conventional commit format:
   ```
   <type>(<scope>): <subject>

   <body>

   <footer>
   ```
   - Type: feat, fix, docs, style, refactor, test, chore
   - Scope: (optional) the area of code affected
   - Description: brief explanation of changes
   - Body: detailed description if needed
   - Footer: breaking changes or issue references
4. Display the commit message to the user for review
5. Allow user to edit if needed before committing

### 3. Generate Commit Message Summary

Extract commit messages to understand the history:

**MCP:** `git_commit_messages(ancestor="<commit-or-branch>")`
**Bash:** `git log --oneline <commit-or-branch>..HEAD`

Returns commit hashes and messages, useful for:
- Understanding changes across multiple commits
- Identifying key features/bug fixes
- Creating a changelog-style summary

### 4. Create Pull Request Description

Synthesize diff and commit messages into a PR description:

1. Get diff for changed files and modifications
2. Get commit messages for context and intent
3. Parse and organize the information:
   - **Summary**: 1-2 sentence overview from commit messages
   - **Changes**: Key file modifications from diff
   - **Context**: Commit history showing development progression

Format:
```markdown
## Summary
[Brief description from commit messages]

## Key Changes
- [File]: [Brief change description]
- ...

## Commit History
- [Hash] [Message]
- ...
```

## Workflow: Create PR Description from Branch

For a feature branch compared to main:

1. Identify the merge base or ancestor: `origin/main` or `main`
2. Get diff: `git_diff(ancestor="origin/main")`
3. Get commit messages: `git_commit_messages(ancestor="origin/main")`
4. Parse and format into PR description structure

## Error Handling

If git MCP tools are unavailable:
1. Inform the user: "Git MCP tools not detected. These tools provide git diff, cached diff, and commit message functionality."
2. Ask: "Would you like to proceed using bash commands instead?"
3. If user confirms, use the bash fallbacks documented above
4. If user declines, stop the workflow

If git commands fail:
- Verify git repository
- Check ancestor exists (commit hash or branch name)
- Ensure working directory is clean or handle uncommitted changes
