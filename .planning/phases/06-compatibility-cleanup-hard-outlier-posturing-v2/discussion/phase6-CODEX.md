# Phase 6 Codex First Pass

## Recommended Gray Areas

### Slim Eligibility Boundary
- Decision: Treat `gsd-sdk compile --check-slim-eligibility <workflow-id>` as the only authority for moving workflow Markdown to `docs/archive/`.
- Rationale: Phase 6 cleanup must be gated by typed transitions, packet sequencing, provider routing, and parity coverage, not by manual judgment.
- Planning implications: Implement cleanup as a per-workflow operation with explicit pass/fail evidence; failed workflows remain unchanged.

### Thin Launcher Definition
- Decision: A retained launcher may contain only advisory invocation metadata or command forwarding, with no embedded workflow prose, branching logic, packet semantics, or runtime instructions.
- Rationale: Markdown remains compatibility and human entry surface; runtime contract belongs to FSM states and emitted packets.
- Planning implications: Define a strict launcher template and tests that reject inline prose once eligibility has passed.

### Cleanup CI Gate
- Decision: Cleanup PRs must run `node scripts/phase4-parity.cjs` plus any Phase 6 slim eligibility checks, and CI must fail on any non-zero parity or eligibility result.
- Rationale: Phase 4 parity is non-negotiable and hermetic; Phase 6 cannot weaken earlier guarantees while removing Markdown bodies.
- Planning implications: Add a targeted CI/script path for cleanup validation rather than broadening runtime behavior.

### Hard Outlier Posture
- Decision: Register `/gsd-graphify`, `/gsd-from-gsd2`, `/gsd-ultraplan-phase`, `/gsd-review`, and `/gsd-fast` as `hard-outlier` in the classification manifest, with posture records documenting why they are not normal packetized workflows.
- Rationale: Hard outliers should be explicit known exceptions, not unknown workflows or forced advisory packets.
- Planning implications: Compile should accept them as classified outliers while still refusing undocumented unknown workflows.

## Additional Questions

- What exact fields are required in a posture record: command id, classification, rationale, migration status, owner, evidence, and review date?
- Should archived Markdown preserve original relative paths under `docs/archive/`, or use a flat workflow-id naming convention?
- Should slim eligibility be checked for all workflows in CI, or only workflows touched by a cleanup PR?

## Risks and Assumptions

- Assumption: Phase 6 does not migrate hard outliers into FSM packets; it only documents and classifies them.
- Risk: Over-permissive launcher definitions could leave hidden runtime prose in Markdown and blur the SDK/runtime boundary.
- Risk: Moving files to archive may break docs links, command discovery, or tests unless path compatibility is checked.
- Assumption: `node scripts/phase4-parity.cjs` remains the required parity gate and must not be replaced by a narrower Phase 6-only check.
