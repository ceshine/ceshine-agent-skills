# Operation 1: Review Changes

Before reviewing, read the code review guidelines:

- `references/general_code_review_guidelines.md` (always)
- `references/python_code_review_guidelines.md` (when the diff touches Python code)
- `references/rust_code_review_guidelines.md` (when the diff touches Rust code)

Then choose the sub-operation that matches the request. `<repo-root>` is the absolute path to the target repository.

## 1a. Review Staged Changes

Review modifications that have been staged (added to the index) but not yet committed:

1. Get cached changes: `scripts/git-cached-diff.sh <repo-root>`
2. Follow the code review guidelines to evaluate changes

## 1b. Review Unstaged Changes

Review modifications in the working directory that have not yet been staged:

1. Get unstaged changes: `scripts/git-unstaged-diff.sh <repo-root>`
2. Follow the code review guidelines to evaluate changes

## 1c. Review Changes Between Two Commits

Review the diff introduced between any two commits, branches, or refs:

1. Identify the two refs (e.g., `HEAD~3` and `HEAD`, or `main` and a feature branch).
2. Get the diff: `scripts/git-diff.sh <repo-root> <base-ref>` (compares base-ref to HEAD).
3. Optionally gather the commit messages: `scripts/git-commit-messages.sh <repo-root> <base-ref>` to understand the intent behind the changes.
4. Follow the code review guidelines to evaluate changes

---

Present findings clearly, distinguishing between blocking issues and optional suggestions.
