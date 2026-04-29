---
phase: 06-compatibility-cleanup-hard-outlier-posturing-v2
plan: "04"
subsystem: parity-gate
tags: [slim-eligibility, parity, ci-gate, SLIM-03]
dependency_graph:
  requires: ["06-02", "06-03"]
  provides: ["slim-eligibility CI gate in phase4-parity.cjs"]
  affects: ["scripts/phase4-parity.cjs"]
tech_stack:
  added: []
  patterns: ["script→SDK one-directional gate", "content-driven workflowId detection", "fail-closed gate step"]
key_files:
  created: []
  modified:
    - scripts/phase4-parity.cjs
decisions:
  - "slim-eligibility step is a complete no-op when no thin launchers exist — zero false positives on current repo"
  - "workflowId is extracted from launcher YAML content (not filename) to prevent silent bypass via rename"
  - "gate direction is script→SDK only: execFileSync calls bin/gsd-sdk.js, SDK never calls the script"
  - "fail-closed: any non-zero --check-slim-eligibility exit causes immediate process.exit(1) via existing run() helper"
  - "readdirSync wrapped in try/catch so missing workflows dir degrades to no-op (T-06-04-03 mitigation)"
metrics:
  duration: "1 min"
  completed_date: "2026-04-29"
  tasks_completed: 2
  files_modified: 1
requirements-completed: [SLIM-03]
---

# Phase 6 Plan 04: Conditional slim-eligibility Gate in phase4-parity.cjs Summary

**One-liner:** Conditional slim-eligibility CI gate step inserted into phase4-parity.cjs — no-op when no thin launchers exist, fail-closed per launcher when they do.

## What Was Built

A new `slim-eligibility` step was inserted into `scripts/phase4-parity.cjs` between the existing `staleness-gate` and `parity-suite` steps. The step implements SLIM-03 CI gating without adding a competing gate script or weakening any existing Phase 4 assertion.

### Step behaviour

- **No thin launchers present (current repo):** Reads `get-shit-done/workflows/`, finds no `.md` files whose entire trimmed content is a single `\`\`\`gsd-advisory\`\`\`` fenced block, logs `PASS: slim-eligibility (no thin launchers detected — no-op)`, and returns immediately.
- **Thin launchers present (future state):** Extracts `workflowId` from each launcher's YAML block content (not from the filename), then calls `node bin/gsd-sdk.js compile --check-slim-eligibility <workflowId>` via the existing `run()` helper for each discovered launcher. Any non-zero exit from that call causes the gate to `process.exit(1)`.

### Key properties verified

| Property | Verification |
|----------|--------------|
| No-op on current repo | `node scripts/phase4-parity.cjs --step slim-eligibility` exits 0 with no-op message |
| Full gate still passes | `node scripts/phase4-parity.cjs` — all 10 steps pass (128 + 30 + 568 tests, all green) |
| Content-driven workflowId | Synthetic in-memory test: `isLauncher: true`, `workflowId: /workflows/test-slim` |
| Correct step position | `grep -n` confirms: staleness-gate (line 60) → slim-eligibility (line 69) → parity-suite (line 123) |
| No workflow .md files created | `ls get-shit-done/workflows/*.md` — no files present |
| No unexpected deletions | `git diff --diff-filter=D HEAD~1 HEAD` — no deletions |

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Read phase4-parity.cjs and insert slim-eligibility step | 91dc2b0c | scripts/phase4-parity.cjs |
| 2 | Verify full parity gate passes + synthetic launcher detection test | 91dc2b0c | (verification only) |

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The step uses Node.js built-in `require('fs')` only, calls SDK via execFileSync (no shell — no injection surface), and wraps filesystem reads in try/catch per T-06-04-03.

## Self-Check: PASSED

- [x] `scripts/phase4-parity.cjs` modified and committed (91dc2b0c)
- [x] `node scripts/phase4-parity.cjs --step slim-eligibility` exits 0
- [x] `node scripts/phase4-parity.cjs` (full run) exits 0
- [x] Synthetic launcher detection: `isLauncher: true`, `workflowId: /workflows/test-slim`
- [x] No `.md` files written to `get-shit-done/workflows/`
- [x] No unexpected file deletions in commit
