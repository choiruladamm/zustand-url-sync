# Implementation plan — `zustand-url-sync`

Seven phases, M0 → M6. Each has its own file and is written to be executed from a **cold context**: open the phase file, read the three documents it names, execute, verify against its success metrics, stop.

## Phase index

| Phase | File | Produces | Depends on |
|---|---|---|---|
| M0 | [`M0-skeleton.md`](./M0-skeleton.md) | repo, build, CI, gates — no library code | — |
| M1 | [`M1-core-engine.md`](./M1-core-engine.md) | `core/` + `codecs/` + memory & history adapters. Pure, no zustand | M0 |
| M2 | [`M2-middleware.md`](./M2-middleware.md) | the `urlSync` middleware and its type surface | M1 |
| M3 | [`M3-storage-tier.md`](./M3-storage-tier.md) | `storage/`, the second source, versioning | M2 |
| M4 | [`M4-adapters.md`](./M4-adapters.md) | Next / React Router / TanStack adapters + route-change policy | M2 |
| M5 | [`M5-ssr.md`](./M5-ssr.md) | `server/`, `react/`, per-request stores | M4 |
| M6 | [`M6-docs-release.md`](./M6-docs-release.md) | docs, migration guides, frozen API, 1.0.0 | M3, M5 |

M3 and M4 both depend only on M2 and touch different directories — they can run in either order, or in parallel if two people are working. M5 needs M4's adapter interface to be final.

## How to run a phase from a cold context

1. Read, in order: `PRD.md` (the sections the phase names), `CLAUDE.md`, the phase file.
2. Work the task list top to bottom. Tasks are ordered by dependency, not by importance.
3. Run the phase's **Exit checklist**. Every command must pass.
4. Fill in the **Handoff** block at the bottom of the phase file with anything the next phase needs to know that isn't already written down.

Do not start a phase whose predecessor's exit checklist has not passed. The gates are cumulative — M4's CI run includes every M1 test.

## Conventions used in every phase file

- **Prereqs** — what must already exist. Verify before starting.
- **Context** — the decisions from `PRD.md` that this phase implements, restated tightly enough that you don't need the whole PRD in context.
- **Tasks** — ordered, each with a definition of done.
- **Success metrics** — measurable, with the command that measures them. Not "works well".
- **Traps** — mistakes that are easy to make here and expensive to find later. Read this section before writing code, not after.
- **Handoff** — filled in on completion.

## Global rules that outrank anything in a phase file

From `CLAUDE.md`, repeated because they are violated by accident:

1. Zero runtime dependencies.
2. `src/core/**` imports no DOM globals, no React, no zustand.
3. The URL wire format is public API.
4. Nothing syncs or persists without a declared codec.
5. URL > storage > default.
6. No module-level mutable state a server request can reach. The **adapter instance** is the scope root for the queue and the registry.

If a phase file appears to contradict one of these, the invariant wins — and the phase file is wrong. Say so rather than following it.

## Estimating

No dates. Phase size in rough units of work, for sequencing only:

| M0 | M1 | M2 | M3 | M4 | M5 | M6 |
|---|---|---|---|---|---|---|
| S | **L** | **L** | M | **L** | M | M |

M1 and M2 are where the design risk lives. M4 is large because of the example apps, not the code. Do not compress M1 to reach M2 faster — every later phase tests against M1's engine.
