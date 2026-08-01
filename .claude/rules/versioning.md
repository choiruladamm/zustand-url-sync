# Versioning

Semver, changesets-driven. The point of this file is that classification is **mechanical** — you read a diff, not your judgment.

## Three frozen artifacts

CI regenerates each and fails on an unreviewed diff. A diff here *is* the semver decision.

| Artifact | What it freezes | Diff means |
|---|---|---|
| `api/public-api.md` | rolled-up `.d.ts` of every entrypoint | added export → minor · changed/removed → major |
| `api/wire-format.md` | table of `codec + value → query string` | any change → **major** |
| `.size-limit.json` | gzip budget per entrypoint | over budget → fix it or justify in the PR |

Regenerate with `pnpm api:update`. Committing a regenerated file without a matching changeset fails CI.

## Wire format is public API

`c.array` switching separator, `c.boolean` emitting `1` instead of `true`, a default stopping being omitted — all **major**. Not because the types changed, but because links people bookmarked and shared stop resolving to the same view. This is the rule most likely to be broken by accident; the snapshot exists to make that impossible.

Storage format is governed separately by `persist.version` + `migrate`. Changing it is minor if a migration ships, major if not.

## Classification

| Change | Bump |
|---|---|
| Bug fix, internal refactor, perf, dev warning text | patch |
| New codec, new adapter, new optional config field | minor |
| New required config field, renamed/removed export | major |
| Changed default behaviour (limiter, precedence, `clearOnDefault`) | major |
| Wire format | major |
| Dropping a Node/browser/peer version | major |
| Docs, tests, CI, examples | none — no changeset |

Unsure between minor and major? Ask: *would an existing app behave differently after `pnpm up` with no code change?* Yes → major.

## Changesets

- Every PR touching `src/` needs one. CI enforces it.
- Write it for the consumer: what changed, what they must do. Not "refactor queue".
- Majors need a `## Migration` section with before/after code. No exceptions — a major without one is worse than not shipping.

## Pre-1.0

Until 1.0 the surface may still move, but the discipline stays on: bump minor where major is meant, and note it in the changeset. Rehearsing the process before it's binding is the point.
