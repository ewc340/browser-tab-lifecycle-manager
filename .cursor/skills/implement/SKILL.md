---
name: implement
description: Guides end-to-end code implementation in any repository — clarify the goal, explore existing patterns, plan a minimal change set, implement to match local conventions, verify with the project's own tooling, and self-review before finishing. Use when the user asks to implement, build, add, wire up, fix, refactor, or extend code — including features, endpoints, components, scripts, config, or bug fixes. Trigger on phrasing like "implement X", "add support for Y", "build a function/service/endpoint that...", "fix this bug", "wire up Z", or "can you add ___ to this codebase". Prefer this skill for general implementation; use a dedicated TDD skill when the user explicitly wants test-first development.
---

# Code Implementation

Ship the smallest correct change that satisfies the request. Read before you write, match what is already there, and verify with the project's own tools — not a generic checklist invented for this task.

This skill works in any repo and any language. With file/shell access, explore and run commands. Without it (plain chat), still follow the workflow using reasoning and explicit assumptions.

## Workflow

### 1. Clarify the goal

Restate what you are building in your own words: inputs, outputs/behavior, boundaries, and explicit non-goals. Note hard constraints — performance, backward compatibility, security, rollout, or API stability.

If something is genuinely ambiguous in a way that would change the implementation, ask one focused question. Otherwise state your assumption in a sentence and proceed.

### 2. Explore before editing

Before writing code, understand the local landscape:

- **Where does this belong?** Find the module, layer, or directory that already handles similar work.
- **What patterns exist?** Naming, error handling, logging, dependency injection, routing, state management, test layout.
- **What is the blast radius?** List files and callers likely to change.
- **What tooling does the repo use?** Test runner, linter, formatter, build command, package manager — discover these from config files (`package.json`, `pyproject.toml`, `Makefile`, `go.mod`, CI config) rather than assuming.

Do not introduce a second style, framework, or test system when the repo already has one.

### 3. Plan a minimal change set

Outline the smallest set of edits that solves the request:

- Which files to create or modify
- Any migrations, config, or docs that must move in lockstep
- How you will verify the change

Skip a formal plan for tiny, obvious, low-risk edits — but still do step 2's quick read of the surrounding code.

### 4. Implement

Write the minimum correct code. Resist speculative generality, extra config knobs, or behavior nobody asked for.

While implementing:

- **Match conventions** — structure, naming, imports, types, comments, and error style should look like adjacent code in the same directory.
- **Keep scope tight** — no drive-by refactors or unrelated cleanup unless the user asked for it.
- **Cross trust boundaries carefully** — validate or sanitize user input, network payloads, file contents, subprocess arguments, and deserialized data. See `references/security-checklist.md`.
- **Fail clearly** — specific errors beat silent failures; do not swallow exceptions without a deliberate reason.

Implement in small chunks. After each meaningful chunk, run the relevant check (test, lint, build) instead of waiting until the end.

### 5. Verify

Use the project's own verification path:

1. **Automated** — run existing tests; add or update tests when the repo already tests this kind of code and the change is non-trivial. Follow local test conventions (see `references/verification-notes.md`).
2. **Static** — run the linter/formatter/typechecker the repo configures.
3. **Manual** — for UI, CLI, or integration work, exercise the happy path and at least one failure path when automated coverage is thin.

If a check cannot be run (missing deps, no shell access), say what you would run and what you verified by inspection instead.

Every new test should fail before the implementation when you are adding behavior — if it passes immediately, the assertion is probably too weak or you are testing existing behavior.

### 6. Self-review

Before calling it done, spend a few minutes on:

- Does the change match what step 1 described, including edge cases you thought of while coding?
- Any security items from the checklist skipped — and if so, is that a deliberate tradeoff?
- Would a reviewer understand the diff without a verbal walkthrough?
- Any dead code, debug logging, or commented-out attempts left behind?

### 7. Summarize

Close with a short, concrete summary:

- What was built or fixed
- Key files touched
- How it was verified (commands run, or what could not be run)
- Explicit non-goals, follow-ups, or known limitations

Do not restate the entire diff — tell the reader what they cannot get from skimming the code.

## When to adapt

| Situation | Adjust |
|---|---|
| User explicitly wants test-first / TDD | Follow the repo's TDD skill if present; otherwise write tests before implementation |
| Bug fix | Reproduce or pinpoint the failure first; add a regression test when the repo tests this area |
| Refactor only | Preserve behavior; rely on existing tests; do not mix feature work into the same change |
| No tests in repo | Verify manually and document what you checked; do not bolt on a new test framework for one change |
| Large or ambiguous scope | Propose a phased plan and implement the first slice only unless the user asked for the full scope |

## Reference material

- `references/security-checklist.md` — trust-boundary pass for steps 4 and 6
- `references/verification-notes.md` — idiomatic verification defaults when the repo has no established pattern yet
