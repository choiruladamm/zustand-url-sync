# zustand-url-sync

Zustand middleware that syncs declared store keys ↔ URL query params, with an optional storage tier.

`PRD.md` is the spec. Read §5–§7 before changing behaviour. §13 records decisions already made — implement them, don't re-litigate them. If a decision looks wrong, say so and cite evidence; do not quietly diverge.

## Invariants

Breaking any of these is a major release, and needs to be an explicit decision — never a side effect of another change.

1. **Zero runtime dependencies.** `dependencies` stays `{}`. Optional peers only.
2. **`src/core/**` is pure.** No DOM globals, no React, no zustand imports. It must run in Node with no shims.
3. **The URL wire format is public API.** Changing how any built-in codec serialises breaks links people already shared. See `versioning.md`.
4. **Nothing syncs or persists without a declared codec.** No `partialize`, no "sync everything".
5. **URL > storage > default.** Precedence never varies by config.
6. **No module-level mutable state reachable from a server request.** See `architecture.md`.

## Working rules

- Match the surrounding code. Formatting is Biome's job — don't hand-format, don't argue style.
- New behaviour needs a test in the same PR. New public API needs a changeset.
- When PRD and code disagree, the PRD wins until it is edited. Edit it in the same PR.

@.claude/rules/architecture.md
@.claude/rules/conventions.md
@.claude/rules/versioning.md
@.claude/rules/testing.md
