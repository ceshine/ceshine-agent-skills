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

Assign every finding a severity using the definitions below. When unsure between two levels, choose the higher one.

| Severity     | Label                   | Exit Criterion                                                                                                   | Examples                                                                                                                                                                                  |
| ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical** | Must fix before merge   | Would cause a security incident, data loss, crash, silent wrong behavior, or regression in production if shipped | SQL injection; plaintext secrets; missing authz check; off-by-one corrupting user data; `try`/`except: pass` swallowing critical errors                                                   |
| **High**     | Should fix before merge | Will cause real pain within 1-2 future changes and has no practical workaround                                   | Public function signature that callers already rely on; deeply nested conditionals with no tests; missing error handling for an expected failure mode; logic duplication across 3+ places |
| **Medium**   | Fix when convenient     | Violates project conventions or best practices but does not block correctness or readability                     | Bypassing an established abstraction layer; logger using f-strings instead of `%`; missing type hints on a private helper; inconsistent naming within the module                          |
| **Low**      | Optional / style nit    | Trivial improvement with no functional or maintainability impact; reviewer preference                            | Variable name could be slightly clearer; missing blank line between methods; comment wording; alternative approach that is equally valid                                                  |

### General Review Process

**If a language-specific process exists, prefer that process when there are conflicts.**

1. **Understand first.** Read the full diff, commit messages, and any linked issue/PR. Infer the author's intent and constraints before forming opinions.
2. **Read completely before commenting.** If a question or confusion might be resolved by continuing to read, do so.
3. **Categorize each finding** into one of the four output buckets:
   - **Critical Issues** ← severity Critical (must fix before merge)
   - **Important Improvements** ← severity High (should fix before merge)
   - **Suggestions** ← severity Medium + Low (can be addressed later)
   - **What Went Well** ← positive observations worth reinforcing
4. **For every issue, explain _why_ it matters**, not just _what_ is wrong. Provide a concrete fix or code example when the fix is not self-evident.
5. **Ask questions** when the author's intent or a design trade-off is unclear — don't assume.

### Output Format

**Only use this format when a language-specific format is not available.**

Every entry in **Critical Issues**, **Important Improvements**, and **Suggestions** must follow the sub-structure below. For **What Went Well** and **Recommended Actions**, keep entries concise.

#### Section Definitions

**Critical Issues** — findings with Critical severity. These MUST be resolved before the change can merge. If none exist, write `_None._` (do not omit the section).

**Important Improvements** — findings with High severity. These SHOULD be resolved before merge; if deferred, the author must have a documented reason. Write `_None._` if none.

**Suggestions** — findings with Medium or Low severity. These are optional and can be addressed in a follow-up PR. Group related suggestions together when they share a theme. Each entry within this section retains its individual Medium or Low severity label. Write `_None._` if none.

**What Went Well** — specific patterns, decisions, or code that the author should keep doing. Be concrete; avoid generic praise like "looks good." Write `_None noted._` if nothing stands out.

**Recommended Actions** — a priority-ordered list of next steps that the author should take. Each action should be traceable to an issue raised above. If there are no actions, state that explicitly.

#### Entry Sub-Structure

For each entry in **Critical Issues**, **Important Improvements**, and **Suggestions**, use:

```
- **`<file-path>`** (line ~N): <one-line summary of the problem>

  **Why it matters**: <explain the risk, pain, or missed opportunity — not just the rule>
  **How to fix**: <concrete action, preferably with a code sketch>
  **Severity**: Critical / High / Medium / Low
```

Merge entries for the same file and same root cause into a single bullet.

#### Full Template

```
## Code Review Summary

**Overall Assessment**: <1-2 sentences covering the change's intent, its most notable quality, and the most important thing to address.>

### Critical Issues

- **`path/to/file.ext`** (line ~N): <summary>

  **Why it matters**: <explanation>
  **How to fix**: <concrete fix or code sketch>
  **Severity**: Critical

### Important Improvements

- **`path/to/file.ext`** (line ~N): <summary>

  **Why it matters**: <explanation>
  **How to fix**: <concrete fix or code sketch>
  **Severity**: High

### Suggestions

- **`path/to/file.ext`** (line ~N): <summary>

  **Why it matters**: <explanation>
  **How to fix**: <concrete fix or code sketch>
  **Severity**: Medium

### What Went Well

- <concrete, replicable pattern or decision the author should continue>

### Recommended Actions

1. <Actionable step, tied to an issue above>
2. ...
```
