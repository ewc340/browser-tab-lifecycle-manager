# Verification notes

Defaults for step 5 when the repo has no established test pattern yet. **Always prefer the repo's existing conventions** over these notes — read `package.json`, `pyproject.toml`, `Makefile`, `go.mod`, and CI config first.

## Discovering what to run

| Signal | Likely command |
|---|---|
| `package.json` scripts (`test`, `lint`, `check`, `build`) | `npm test`, `npm run lint`, etc. |
| `pyproject.toml` / `pytest.ini` / `tox.ini` | `pytest`, `tox`, `ruff check`, `mypy` |
| `go.mod` | `go test ./...`, `go vet ./...` |
| `Makefile` with `test` / `lint` targets | `make test`, `make lint` |
| `.github/workflows/*` or `.gitlab-ci.yml` | Mirror what CI runs locally |

Run the narrowest command that covers your change first (single package or file), then widen if needed.

## Python
- Framework: `pytest` is the common default. Prefer plain `assert` over `unittest`-style assertions.
- File convention: `test_<module>.py` under `tests/`, mirroring source layout unless the repo does otherwise.
- For exceptions: `with pytest.raises(SpecificError, match="..."):`

## TypeScript / JavaScript
- Framework: check `package.json` for `vitest` or `jest` before assuming.
- File convention: `<module>.test.ts` colocated or under `__tests__/`, per repo convention.
- For async code, `await` assertions — a dropped `await` on a rejected promise silently passes.

## Go
- Framework: standard library `testing`. Table-driven tests via `t.Run` are idiomatic.
- File convention: `<file>_test.go` in the same package/directory as the source.

## General
- Test through the public interface; avoid depending on private/internal details that refactors should not break.
- Prefer the language's standard mocking approach over hand-rolled fakes when mocks are needed.
- When you cannot run tests, state the exact command the user should run and what you verified by reading the code.

## This repository

| Check | Command |
|---|---|
| Lint + typecheck | `npm run lint` |
| Unit tests | `npm run test` |
| Build extension | `npm run build` |
| Package zip | `npm run package` |
| E2E (Playwright) | `npm run test:e2e` |
| Full CI-style verify | `npm run verify` (bundle audit after build) |

Unit tests live in `src/tests/`. E2E tests live in `e2e/`. Prefer adding unit tests for pure logic; E2E for panel/UI flows.
