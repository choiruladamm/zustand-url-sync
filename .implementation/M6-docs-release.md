# M6 — Docs and 1.0.0

**Goal:** someone who has never seen this library ships a working filter bar in under ten minutes, and the public surface is frozen deliberately rather than by accident.

**Size:** M · **Depends on:** M3 and M5 · **Next:** none — this is 1.0

Read first: `PRD.md` §2.2 (the competitor gap list — it's the marketing copy), §12, `.claude/rules/versioning.md`.

---

## Why this phase exists

The research in PRD §2 says the incumbent has 6.7k weekly downloads against Zustand's 49M. That gap is not a code gap — `zustand-querystring` works. It's a discoverability and trust gap. This phase is the actual competitive work, and treating it as paperwork after the "real" phases is how good libraries stay at 6.7k.

Second job: freezing the API on purpose. After 1.0 every public name is a promise.

---

## Prereqs

M3 and M5 exit checklists passed. Full CI green, all gates.

---

## Tasks

### 1. README — the ten-minute path

Order is deliberate; most library READMEs get it wrong by leading with philosophy.

1. One sentence, then the 80% code block from PRD §5.1 with its resulting URL. A reader must see the value inside fifteen seconds of scrolling.
2. Install, including the peer requirements.
3. **Choosing your setup** — the SPA / SSR decision rule from §5.8, as a two-row table, before any API reference. Getting this wrong is the expensive mistake; it goes above the fold, not in an advanced section.
4. Adapter setup, one block per router.
5. Codec reference table with the wire format shown for each — this doubles as the human-readable half of `api/wire-format.md`.
6. Options reference.
7. Recipes: reset page on filter change · debounce while typing, push on Enter · two tables on one page · server-rendered `<Link href>` · reading filters outside React.
8. FAQ, led by the questions the design actually provokes: *why not just `nuqs`?* · *why not official `persist`?* · *why does my URL not update instantly?* (limiters) · *why is my array re-writing every render?* (missing `eq`).

### 2. Migration guides

Two files, both written as *diffs*, not prose. These are the highest-leverage documents in the repo — each converts an existing user of a working solution.

**From `zustand-querystring`** — closest competitor, so map its API to ours line by line: `select` → `params`, `prefix` → `prefix`, `key`/`format` → not applicable (we always write idiomatic params), `map` → the honest answer is we have no direct equivalent; show the workaround. Note the URL format changes, which means old shared links won't resolve — that's a real migration cost and hiding it would be a bad trade for a day-one trust deficit.

**From `nuqs`** — different model, so frame it as when to switch: your state already lives in Zustand, or you need the storage tier. Be fair — `nuqs` is excellent and better for hook-shaped state. A guide that oversells loses the reader who has used both.

### 3. Docs site

Only if the README has outgrown itself. A single well-organised README beats a thin docs site, and a docs site that lags the code is worse than none. If yes: Fumadocs or VitePress, deployed from `docs/`, with every code sample type-checked in CI.

### 4. The dashboard demo

One deployed example doing the real thing: table, search, multi-select filters, sort, pagination, shareable URL, remembered page size. Link it from the top of the README.

This is what someone shares when recommending the library. It carries more weight than any paragraph.

### 5. Freeze the API

- Review every export in `api/public-api.md` one at a time. Anything not deliberately public gets marked `@internal` or removed **now** — after 1.0 it's a major.
- Review `api/wire-format.md` the same way. Every row is a promise about links people will bookmark.
- Confirm the size budgets hold at their PRD targets and were never quietly raised. If they were, either fix it or state the new number in the README with a reason.

### 6. Release mechanics

- Arm `release.yml` (remove the `if: false` from M0).
- npm provenance on, `--access public`.
- Verify a `pnpm pack` tarball contains `dist/` and `LICENSE` and nothing else — no `src/`, no `examples/`, no `.implementation/`.
- Tag `v1.0.0`, GitHub release with real notes, publish.
- Install the tarball into a fresh Vite app and a fresh Next app and run the quickstart from the README verbatim. This catches packaging bugs that every internal test misses.

### 7. Launch

The gap list from PRD §2.2 is the post. Concrete and comparative, no hype: zero deps vs `lodash-es`, idiomatic params vs a custom format, storage tier, router adapters, rate limiting, typed codecs.

Where: the Zustand GitHub discussions, r/reactjs, the Zustand Discord, a short technical writeup. Not a launch announcement — a writeup about the History API rate limit and the multi-store race would be genuinely useful to people who never install this, and that's what gets shared.

Open an issue on `zustand`'s repo asking to be listed in the third-party middleware docs, once the demo is live.

---

## Success metrics

| # | Metric | How measured | Pass |
|---|---|---|---|
| 1 | **Cold-start time to a working filter bar** | someone who hasn't seen the library follows the README, timed | < 10 min |
| 2 | Every README code sample compiles | `pnpm docs:typecheck` | green |
| 3 | Fresh-install smoke test, Vite and Next | task 6 | quickstart works verbatim |
| 4 | Published tarball contains only `dist/` + `LICENSE` + `README` | `pnpm pack && tar tzf` | no stray files |
| 5 | Both migration guides exist and are diff-shaped | review | complete |
| 6 | Demo deployed and linked | URL responds | live |
| 7 | Public API reviewed export by export | `api/public-api.md` walked in the release PR | signed off |
| 8 | Wire format reviewed row by row | same | signed off |
| 9 | Size budgets at PRD targets, unraised | `pnpm size` + git history of `.size-limit.json` | unchanged since M0 |
| 10 | Zero runtime deps at publish | `npm view zustand-url-sync dependencies` | `{}` |

Post-release, from PRD §12: 1,000 weekly downloads and ≥25 stars at 3 months; 10,000 weekly at 6 months. Those measure the launch, not this phase — record them, don't gate on them.

---

## Traps

- **Leading the README with architecture.** Nobody reads paragraph three. Code block first.
- **Burying the SPA/SSR decision.** It's the one mistake that produces a scary bug. Above the fold.
- **Overselling against `nuqs`.** Readers have used it. Unfair comparison costs more credibility than it buys attention.
- **Hiding the URL-format break** in the `zustand-querystring` migration. They'll find out from a broken bookmark, and then it's a trust problem instead of a documented cost.
- **Publishing without the fresh-install test.** Every packaging bug that has ever shipped passed the internal test suite.
- **Shipping 1.0 with an export nobody deliberately reviewed.** That's how libraries end up with a permanent `utils` namespace.

---

## Handoff

*Fill in on completion.*

- Published version and date:
- Exports removed or marked `@internal` during the freeze:
- Wire-format rows that were changed before freezing:
- Cold-start timing result, and what tripped the reader up:
- Where it was announced, and the first week's numbers:
