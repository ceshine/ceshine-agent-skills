---
name: generate-commit-message
description: Generate a commit message for staged git changes. Use this when the user wants a commit message, asks to summarize staged changes for a commit, or invokes a prompt that should draft a commit message from the index.
disable-model-invocation: true
---

# Generate Commit Message

Use this skill for requests that are specifically about drafting a commit message from staged changes.

## Workflow

1. Load the `git-workflows` skill.
2. Follow its "Generate Commit Message for Cached/Staged Changes" operation exactly.
3. Do not invent a parallel commit-message process in this skill. This skill exists to make the trigger explicit and route the task into the canonical git workflow.

## Trigger Examples

- "Generate a commit message for the staged changes."
- "Write a commit message for what I have staged."
- "Summarize the staged diff as a conventional commit."

## Scope

This skill is only for staged changes. If nothing is staged, confirm that before attempting to draft a message and follow the git workflow's handling.
