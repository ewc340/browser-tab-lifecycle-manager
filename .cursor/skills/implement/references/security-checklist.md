# Security checklist

A working pass for steps 4 (implementing) and 6 (self-review). Not every category applies to every change — a pure data-transform function has no auth surface; a CLI utility that never touches the network has no injection surface. Use judgment about which sections are relevant, and say explicitly in the summary if a category was consciously skipped.

## Input handling
- Every input crossing a trust boundary (HTTP request, CLI arg, file contents, message-queue payload, env var sourced from outside your own deploy) gets validated before use — type, range, length, format.
- Untrusted size is bounded before it's read into memory or iterated over (avoid unbounded reads, unbounded loops keyed on user-controlled counts).
- Reject-by-default beats sanitize-and-continue when input is malformed — a rejected request is debuggable; a silently "cleaned" one hides the bug.

## Injection
- No string concatenation or f-string interpolation of untrusted input into: SQL/ORM raw queries, shell commands, file paths, HTML/templates, regex patterns, or LDAP/XML queries. Use parameterized queries, `subprocess` with an argument list (never `shell=True` on untrusted input), path-joining that rejects `..`/absolute overrides, and templating with autoescaping on.
- If a regex is built from user input, treat it as an injection point too (ReDoS via attacker-controlled pattern).

## AuthN / AuthZ
- New endpoints/handlers inherit the app's normal auth checks — don't add a route and forget the middleware.
- Authorization checks the *resource owner*, not just "is this user logged in" (the classic IDOR gap: user is authenticated but fetching someone else's record by ID).
- When adding access-controlled behavior, consider at least one "authenticated but not authorized" case, not only "unauthenticated."

## Secrets
- No credentials, API keys, tokens, or connection strings hardcoded, even as "temporary" placeholders — use the project's existing secrets/config mechanism.
- New logging statements don't print full request/response bodies, tokens, passwords, or PII. Log identifiers, not payloads.

## Deserialization
- Untrusted data isn't passed to unsafe deserializers (`pickle.loads`, `yaml.load` without `SafeLoader`, `eval`/`exec` on any input, insecure XML parsers vulnerable to XXE). Prefer JSON or explicitly-safe variants for anything crossing a boundary.

## Dependencies
- A new dependency is added only if it earns its place — check it's maintained and reasonably scoped, not a 200-line problem solved by a 50k-line library with its own attack surface.
- Pin versions consistently with how the rest of the project does it.

## Concurrency / resource use
- Shared mutable state touched by the new code is protected the way the rest of the codebase protects it (lock, actor, transaction) — don't introduce a lone unguarded access.
- Anything that acquires a resource (file handle, connection, lock) releases it on every exit path, including exceptions.
- If the code is retried automatically (queue consumer, webhook handler), it's idempotent or verification proves double-delivery is safe.

## Logging & observability
- Errors are logged with enough context to debug later (what operation, what identifiers — not what secrets), and failures aren't swallowed silently in a bare `except`/`catch`.
