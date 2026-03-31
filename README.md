# Ceshine's Skill Repository

This is a collection of skills that I personally use in my daily work. Some of them are copied directly from the source material, with a proper license notice in the subfolder. Most of them are a mix of my original work and adaptations of others' work. A small number of them are entirely my own original work.

## Usage

Install a skill using the `npx skills add` command:

```bash
npx skills add <skill-name>
```

## Available Skills

| Skill | Description |
|-------|-------------|
| [using-skills](using-skills/) | Always use at the beginning of a session. Establishes how to find and use skills, and requires relevant Skill tool invocation before any response. |
| [skill-creator](skill-creator/) | Guide for creating effective skills. Use when creating or updating a skill that extends the agent's capabilities. |
| [git-workflows](git-workflows/) | Handles all git-related requests (commit messages, staging review, history, PR descriptions) consistently. |
| [generate-commit-message](generate-commit-message/) | (Shortcut Command) Generate a commit message for staged git changes. |
| [context7-skill](context7-skill/) | Access up-to-date, version-specific documentation and code examples from Context7. |
| [markdown-dot-new](markdown-dot-new/) | Convert a public web page URL into Markdown via `markdown.new`. |

## Acknowledgements

This section lists resources I used when creating the skills of this repository, categorized by topics.

## Code Reviews

**Python:**

- [the-ai-engineer/ai-engineer-tutorials](https://github.com/the-ai-engineer/ai-engineer-tutorials/blob/main/src/01-claude-skills/.claude/skills/code-review/SKILL.md)
- [jorijn/meshcore-stats](https://github.com/jorijn/meshcore-stats/blob/main/.codex/skills/python-code-reviewer/SKILL.md)

**Rust:**

- [rstlix0x0/aiassisted](https://github.com/rstlix0x0/aiassisted/blob/main/.aiassisted/skills/review-rust/SKILL.md)
- [ZhangHanDong/rust-code-review-guidelines](https://github.com/ZhangHanDong/rust-code-review-guidelines/blob/main/README.md)

## General

- [obra/superpowers](https://github.com/obra/superpowers/): The source of the [using-skills](using-skills/) skill.
- [anthropics/skills/](https://github.com/anthropics/skills/): The source of the [skill-creator](skill-creator/) skill.
