# Rust Code Review Guidelines

## Core Principle

> **Approve a change once it definitely improves the overall code health of the Rust codebase, even if it is not perfect.**

Apply general code review principles with additional attention to Rust's unique characteristics: ownership, lifetimes, safety, and idiomatic patterns.

## Instructions

### Step 1: Verify Compilation

All code must compile with zero warnings:

```bash
cargo check 2>&1 | grep -c warning  # Must be 0
cargo clippy 2>&1 | grep -c warning  # Must be 0
```

Check for lint overrides - any `#[allow(...)]` must have documented reason. Prefer `#[expect(...)]` with `reason`.

### Step 2: Review Checklist

#### Safety and Soundness

- [ ] Is `unsafe` actually necessary? (FFI, performance with benchmarks, novel abstractions)
- [ ] Safety invariants documented in `// SAFETY:` comments
- [ ] No undefined behavior risks
- [ ] `Send`/`Sync` implementations are correct

#### Error Handling

- [ ] Libraries use canonical error structs (not `anyhow`/`eyre`)
- [ ] Errors implement `std::error::Error`, `Debug`, `Display`
- [ ] Panics only for programming errors, not recoverable errors
- [ ] `unwrap()`/`expect()` have clear justification

#### Ownership and Lifetimes

- [ ] Ownership transfers are intentional
- [ ] No unnecessary cloning
- [ ] References used where ownership not needed
- [ ] Lifetimes as simple as possible

#### API Design

- [ ] Public types implement common traits (`Debug`, `Clone`, `PartialEq`, etc.)
- [ ] Sensitive types have redacted `Debug`
- [ ] Follow `as_`/`to_`/`into_` conventions
- [ ] Getters have no `get_` prefix
- [ ] No smart pointers in public APIs unless fundamental

#### Performance

- [ ] No unnecessary allocations in hot paths
- [ ] `String` vs `&str`, `Vec<T>` vs `&[T]` used appropriately
- [ ] `Arc` only when concurrent shared ownership required

#### Testing

- [ ] Unit tests for success and error paths
- [ ] Edge cases covered (empty, boundaries, Unicode)
- [ ] Test names: `test_<function>_<scenario>`

#### Debuggability

- [ ] Logging: Ensure there's adequate logging, especially in critical paths and potential error points. Logs should be clear, meaningful, and help developers quickly pinpoint issues.
- [ ] Error Messages: Ensure error messages are clear, specific, and provide enough context to help locate issues.
- [ ] Assertions and Verifications: Use assertions at key points to verify assumptions, ensuring code behavior is as expected.

#### Documentation

- [ ] All public items have doc comments
- [ ] `# Errors` section for `Result` functions
- [ ] `# Panics` section if function can panic
- [ ] `# Safety` section for `unsafe` functions

### Step 3: Provide Feedback

Follow the "Output Format" section in [references/general_code_review_guidelines.md](references//general_code_review_guidelines.md) to provide code review feedback to the user.
