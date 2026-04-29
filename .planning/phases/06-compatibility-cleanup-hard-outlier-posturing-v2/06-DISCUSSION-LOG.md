# Phase 6: Compatibility Cleanup + Hard Outlier Posturing (v2+) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29T02:00:00+01:00
**Phase:** 06-Compatibility Cleanup + Hard Outlier Posturing (v2+)
**Areas discussed:** Slim eligibility boundary, thin launcher and archive sequencing, cleanup CI gate, hard outlier posture records, Phase 6 pilot scope
**Mode:** `--auto` with required multi-model first-pass and cross-review roundtable

---

## Slim Eligibility Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Compiler flag | `gsd-sdk compile --check-slim-eligibility <workflow-id>` reuses compiler-owned data and emits structured verdicts. | ✓ |
| Separate query/command | Add a new query or subcommand separate from compile. | |
| Parity-only check | Treat Phase 4 parity as sufficient by itself. | |

**Auto-selected choice:** Compiler flag.
**Notes:** All providers agreed the compiler is the right authority. Cross-review rejected parity-only eligibility because SLIM-01 requires typed transitions, packet sequencing, provider routing, and parity coverage.

---

## Thin Launcher and Archive Sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Two-step sequence | Write launcher-only Markdown first, then archive original prose after green evidence. | ✓ |
| Atomic move-and-replace | Move original and write thin launcher as one file operation. | |
| Leave prose in place | Keep current workflow prose and only mark it eligible. | |

**Auto-selected choice:** Two-step sequence.
**Notes:** Claude and Codex preferred a checkable intermediate state; Gemini's file I/O concern was retained as tooling guidance. The compiler should enforce eligibility, not git commit structure.

---

## Cleanup CI Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `phase4-parity.cjs` conditionally | Keep the single hermetic parity gate and add slim checks only when slim evidence or launchers are present. | ✓ |
| Add a new Phase 6 gate script | Run cleanup validation separately from Phase 4 parity. | |
| Add a new `--ci-enforce-slim` mode | Put the behaviour behind a parity-script flag. | |

**Auto-selected choice:** Extend `phase4-parity.cjs` conditionally.
**Notes:** This preserves the existing single-gate model and avoids a competing cleanup gate. The SDK eligibility flag must not call the parity script directly.

---

## Hard Outlier Posture Records

| Option | Description | Selected |
|--------|-------------|----------|
| YAML under `sdk/src/advisory/outlier-postures/` | Human-authored, machine-readable posture records parsed by the compiler. | ✓ |
| TypeScript generated data | Store outlier records in generated TypeScript and generate docs from that. | |
| Markdown-only docs | Document outliers only in human docs without compiler validation. | |

**Auto-selected choice:** YAML posture records.
**Notes:** Claude and Codex converged on source-authored structured files. Gemini's documentation-generation idea remains possible as an additive output, not the source of truth.

---

## Hard Outlier Slimming Eligibility

| Option | Description | Selected |
|--------|-------------|----------|
| Exempt and reject eligibility | Hard outliers remain full-prose compatibility workflows and `--check-slim-eligibility` rejects them. | ✓ |
| Allow future normal slimming | Treat hard outliers like any other workflow once parity improves. | |
| Packetise as part of Phase 6 | Convert outliers into normal advisory packets. | |

**Auto-selected choice:** Exempt and reject eligibility.
**Notes:** All providers agreed Phase 6 should not wrap, packetise, or slim hard outliers. `migrationDisposition` captures whether a future reclassification is possible.

---

## Phase 6 Pilot Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded pilot set | Slim 3–5 eligible non-outlier workflows if live compile data proves eligibility. | ✓ |
| Machinery only | Implement checks and posture records, but do not slim any workflow. | |
| All 84 workflows | Attempt broad corpus-wide slimming in Phase 6. | |

**Auto-selected choice:** Bounded pilot set.
**Notes:** This is the safe `--auto` default. If no candidate passes eligibility, execution falls back to machinery plus posture records only.

---

## Claude's Discretion

- Helper names, exact diagnostic codes, YAML parsing implementation, and test layout may follow existing compiler/query patterns.
- Planner may split Phase 6 into waves for eligibility machinery, posture records, CI enforcement, launcher schema, and pilot slimming.

## Deferred Ideas

- Automated `--apply-slim` mutation.
- Hard-outlier reclassification or packetisation.
- Broad slimming of all 84 workflows.
