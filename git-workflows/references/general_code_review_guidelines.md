## Review Guidelines

### Principles

**Decision Making**

- Prefer clarity and explicitness over cleverness
- Balance pragmatism with long-term maintainability
  - Suggest incremental improvements
  - "Perfect is the enemy of good"
- Reference project conventions in `AGENTS.md` or `CLAUDE.md`

**Communication: Be Constructive**

- Explain _why_ something matters
- Provide specific, actionable recommendations
- Include code examples for fixes
- Acknowledge good practices

**Pay Attention to Context**

- Consider project conventions
- Match surrounding code style when editing
- Balance improvement with backwards compatibility
- Know when rules have valid exceptions

### Prioritize Issues

1. **Critical**: Security issues, correctness bugs
2. **High**: Significant readability/maintainability issues
3. **Medium**: Style violations, minor best practices
4. **Low**: Nitpicks, suggestions

### General Review Process

**If a language-specific process exists, prefer that process when there are conflicts.**

- Understand intent, constraints, and context first.
- Read the full change before commenting. If your questions or confusions may be addressed by reading more, do so.
- Organize feedback into critical issues, important improvements, suggestions, and praise.
- Explain why an issue matters and provide concrete examples or fixes.
- Ask questions when assumptions are unclear.

### Output Format

**Only use this format when a language-specific format is not available.**

```
## Code Review Summary

**Overall Assessment**: <1-2 sentence summary>

### Critical Issues
- ...

### Important Improvements
- ...

### Suggestions
- ...

### What Went Well
- ...

### Recommended Actions
- ...
```
