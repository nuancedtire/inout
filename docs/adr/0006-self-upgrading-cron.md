# ADR-006: Self-upgrading maintenance via GitHub issues + cron

**Date:** 2026-06-21
**Status:** Accepted design; external operational state unverified

**Review (2026-10-17):** This ADR records the June 2026 maintenance design. This checkout contains no scheduler configuration or GitHub Actions workflow implementing it; `wrangler.jsonc` has no Cron Triggers. The historical job ID/cadence and current issue/PR states were not inspected or changed in the local application review. Do not interpret this document as an instruction to activate a cron or contact GitHub without an explicit maintenance request. For current local verification and limitations, see [AUDIT.md](../../AUDIT.md).

Schema maintenance now uses `src/db/schema.ts` and new SQL files under `drizzle/migrations/`, not the old `migrations/0001_init.sql`. Use the current pnpm checks in [README.md](../../README.md), including tests and both TypeScript projects as well as a build, before considering implementation complete.

## Context

The project initially used a static `AUDIT.md` file as its feature backlog. A consolidated cron job executed one item per run. This required manual backlog maintenance — items were not marked done, new issues were not discovered, and the file drifted from reality.

## Decision

Replace the static backlog with a self-upgrading system:

1. **Discovery (Phase A):** The cron scans the codebase for issues across 8 categories (doc-code drift, dead code, duplication, missing error handling, accessibility, security, performance, DX) and files findings as GitHub issues labeled `needs-triage`.

2. **Implementation (Phase B):** The cron picks the oldest open `auto-fix` issue, reads any human comments as constraints, implements the fix, and opens a PR.

3. **Control surface:** Six GitHub labels (`needs-triage`, `auto-fix`, `wont-fix`, `in-progress`, `ready-to-merge`, `question`) let the human steer the agent without touching code.

4. **Safety:** The agent never pushes to main. All changes go through PRs. Build must pass before PR is opened.

## Rationale

- **Self-healing:** The system catches drift (stale docs, dead files) without human attention.
- **Auditable:** Every change has an issue → PR → merge trail on GitHub.
- **Steerable:** The human sets priority by labeling issues, adds constraints via comments.
- **Dogfooding:** The system maintains its own documentation (AGENTS.md, CONTEXT.md).

## Trade-offs

- **GitHub dependency:** If GitHub is down, the agent can't file issues or open PRs. Mitigation: the agent logs findings to `POLISH_LOG.md` as a fallback.
- **Label discipline:** If issues pile up in `needs-triage`, the agent can't self-improve until the human triages. This is by design — the human is the rate-limiter.
- **No multi-PR parallelism:** One PR per cron tick keeps the git history clean and avoids merge conflicts. Slow, but safe.

## Consequences

- `AUDIT.md` becomes a seed document only. GitHub issues are canonical.
- The cron prompt is rewritten for discovery + implementation phases.
- `CONTEXT.md` must include the label taxonomy.
- `POLISH_LOG.md` remains as a local audit trail of cron activity.
