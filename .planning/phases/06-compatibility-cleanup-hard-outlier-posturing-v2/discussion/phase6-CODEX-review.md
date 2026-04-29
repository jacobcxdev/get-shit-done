## Cross-Review Positions

### Endorse

- `gsd-sdk compile --check-slim-eligibility <workflow-id>` should be the canonical eligibility check. [consensus]
- Thin launchers should remain at existing workflow paths, with original prose archived only after eligibility passes. [consensus]
- Hard outliers must be explicitly classified as `hard-outlier` and have posture records. [consensus]
- `node scripts/phase4-parity.cjs` remains the required CI gate and should be extended, not replaced. [consensus]

### Revise

- Slimming should be two logical steps, but not necessarily enforced as separate git commits by tooling. CONTEXT.md should require "launcher reduction before archive, with green eligibility/parity evidence before archive." Commit granularity can be a planning convention, not a compiler rule. [majority]
- The slim eligibility check should use compiler-owned data and parity coverage artifacts; the SDK should not shell out to `scripts/phase4-parity.cjs`. CI can run both. [majority]
- Posture records should be source-authored structured files, preferably YAML or JSON under `sdk/src/advisory/outlier-postures/`, then surfaced into generated compile manifests. Do not make `sdk/src/generated/compile/outliers.ts` the source of truth. [majority]
- Hard outliers should not be slimmed in Phase 6. They are explicitly outside normal packet migration and should retain their compatibility prose plus posture metadata unless a later phase reclassifies them. [consensus]

### Challenge

- Challenge Claude's proposed `--force-eligible` escape hatch. SLIM-01 says archive only when eligibility verifies all gates. Unknown or incomplete eligibility should exit non-zero, not warn-and-allow.
- Challenge Gemini's "eligibility delegates entirely to Phase 4 parity." Parity is required but not sufficient; SLIM-01 also requires typed transitions, packet sequencing, and provider routing.
- Challenge automated `--apply-slim` as Phase 6 scope. The phase should define checks, launcher shape, archive rules, and CI enforcement. Automated mutation can be future work.

## Final Recommended Decisions For CONTEXT.md

- `gsd-sdk compile --check-slim-eligibility <workflow-id>` is the sole archive eligibility authority and must emit structured verdict output with non-zero exit on any failed or indeterminate gate. [consensus]
- Eligibility requires all four checks: typed transitions, packet sequencing, provider routing, and parity coverage. Phase 4 parity is mandatory but not sufficient by itself. [consensus]
- Slimmed workflows keep a thin launcher at the original workflow path; archived prose moves to `docs/archive/` only after eligibility passes. [consensus]
- Thin launchers may contain only advisory invocation/forwarding metadata, not workflow prose, branching logic, runtime semantics, or packet definitions. [consensus]
- CI should continue to use `node scripts/phase4-parity.cjs` as the single parity gate, extended with Phase 6 slim checks where slim evidence exists or launcher files are detected. [majority]
- Hard outlier posture records should be machine-readable, human-authored files co-located with SDK advisory/compiler inputs, then included in generated classification output. [majority]
- `/gsd-graphify`, `/gsd-from-gsd2`, `/gsd-ultraplan-phase`, `/gsd-review`, and `/gsd-fast` remain hard outliers in Phase 6 and should not be wrapped, slimmed as normal FSM workflows, or treated as packetized advisory flows. [consensus]

## User Escalation

No true three-way split requires escalation on the core mechanics.

One unresolved scope question does need user or planner confirmation: whether Phase 6 should slim a bounded pilot set or only implement the machinery and posture records. The safer --auto default is a bounded pilot only after eligibility proves green.
