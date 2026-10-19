# Operation 4: Create Pull Request Description

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

## Workflow Notes

- Identify the merge base (usually `origin/main` or `main`).
- Run `scripts/git-diff.sh <repo-root> origin/main` and `scripts/git-commit-messages.sh <repo-root> origin/main` to gather the data.
- Parse and organize the collected information into the sections above before sharing with the user.
