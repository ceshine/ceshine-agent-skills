## Review Philosophy

> "Code is read much more often than it is written." - Guido van Rossum

**Key Principle**: Consistency within a project is more important than rigid adherence to rules. When in doubt, prioritize:

1. Consistency within one function/module (most important)
2. Consistency within the project
3. Consistency with PEP 8/Google Style Guide

Know when to be inconsistent:

- When applying the guideline makes code less readable
- To match surrounding code style (but consider refactoring)
- When code predates the guideline
- For backwards compatibility

## Review Process

When reviewing Python code, **analyze against these standards** (in order of importance):

  a. Style & Formatting (PEP8)
  b. Imports (PEP8)
  c. Naming Conventions (PEP 8 + Google; more details below)
  d. Documentation (PEP 257 + Google)
  e. Type Hints (PEP 484 + Google; more details below)
  f. Code Quality & Best Practices (more details below)
  g. Security
  h. Performance
  i. Maintainability (more details below)

### Naming Conventions

**Special Prefixes/Suffixes**

- `_single_leading`: weak "internal use" indicator (not imported by `from M import *`)
- `single_trailing_`: avoid keyword conflicts (`class_`)
- `__double_leading`: name mangling in classes (discouraged by Google - impacts testability)
- `__double_leading_and_trailing__`: magic methods (never invent these)

**Names to Avoid**

- Never use `l` (lowercase L), `O` (uppercase o), `I` (uppercase i) as single-char names
- Avoid abbreviations unless well-known
- No offensive terms
- No needless type info: `id_to_name_dict` → `id_to_name`

**Descriptive Names**

- Names should be descriptive and clear
- Descriptiveness proportional to scope (wider scope = more descriptive)
- Single-char names OK for: counters (`i`, `j`, `k`), exceptions (`e`), file handles (`f`), type vars (`_T`, `_P`)
- Avoid vague names: `thing`, `stuff`, `data` (without context)

### Type Hints

**Basic Rules**

- Strongly encouraged for function signatures
- Use for complex functions, public APIs, when types aren't obvious
- Don't annotate `self` or `cls` (except when needed for proper type info - use `Self`)
- Don't annotate `__init__` return (always `None`)

**Modern Syntax (Python 3.10+)**

- Use `|` for unions: `str | None` (not `Optional[str]` or `Union[str, None]`)
- Use built-in types: `list[int]`, `dict[str, int]` (not `List[int]`, `Dict[str, int]`)
- Use `collections.abc` for parameters: `Sequence`, `Mapping` (not concrete types)

**Specific Guidelines**

- Use explicit `X | None` not implicit (`a: str = None` is wrong)
- Specify generic parameters: `list[int]` not bare `list`
- Use `Any` when best type unknown (but prefer `TypeVar` when possible)
- Type aliases: `CapWords` naming, use `TypeAlias` annotation
- Forward references: use `from __future__ import annotations` or string quotes
- Conditional imports: use `if TYPE_CHECKING:` for type-only imports

**Type Variable Naming**

```python
_T = TypeVar("_T")  # Good: leading underscore, descriptive
_P = ParamSpec("_P")  # Good: leading underscore
AddableType = TypeVar("AddableType", int, float, str)  # Good: descriptive
```

### Code Quality & Best Practices

**Exception Handling**

- Never use bare `except:` (catches SystemExit/KeyboardInterrupt!)
- Use specific exceptions: `except ValueError:` not `except Exception:`
- Minimize try block scope (avoid masking bugs)
- Use `finally` for cleanup or prefer context managers
- Exception chaining: `raise X from Y` or `raise X from None`
- Derive from `Exception` not `BaseException`
- Exception names end in `Error` (if they are errors)

**Logging**

```python
# Good - Use %-style (not f-strings!)
logger.info('TensorFlow version: %s', tf.__version__)

# Bad - Don't use f-strings (prevents lazy evaluation)
logger.info(f'TensorFlow version: {tf.__version__}')
```

**Global State**

- Avoid mutable global state
- Module-level constants OK: `MAX_TIMEOUT = 30`
- Name private globals with leading underscore: `_internal_cache`


### Maintainability

**Function Length**

- Prefer < 40 lines (Google guideline, not hard limit)
- Break up long functions unless it harms structure
- If >40 lines, consider if it can be split


**Assertions**

- Don't use `assert` for critical logic (can be disabled with `-O`)
- OK for validating test expectations
- Use `if` + `raise` for preconditions

## Output Format

Structure your review as:

### Summary

- **Overall Assessment**: Excellent/Good/Fair/Needs Improvement
- **Key Strengths**: 2-4 well-implemented aspects
- **Critical Issues**: Issues requiring immediate attention (if any)

### Detailed Findings

Group by category. For each issue:

**[Category: Style/Documentation/Quality/Security/Performance/Maintainability]**

**Issue #**: Brief title
- **Severity**: Critical/High/Medium/Low
- **Lines**: Specific line numbers
- **Description**: Clear explanation of the issue
- **Current Code**:
  ```python
  # Problematic code excerpt
  ```
- **Recommended Fix**:
  ```python
  # Corrected code
  ```
- **Rationale**: Why this matters (readability/safety/performance/maintainability)

### Positive Highlights

- Well-implemented patterns worth noting
- Good adherence to standards
- Exemplary practices

### Recommendations

- Priority-ordered list of improvements
- Consider quick wins vs. larger refactors
- Balance consistency with practical constraints

### References

- [PEP 8 Style Guide](https://peps.python.org/pep-0008/)
- [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)
- [PEP 257 Docstring Conventions](https://peps.python.org/pep-0257/)
- [PEP 484 Type Hints](https://peps.python.org/pep-0484/)
