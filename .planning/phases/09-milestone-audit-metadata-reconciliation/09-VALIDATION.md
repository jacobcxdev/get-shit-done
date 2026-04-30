---
phase: 09
slug: milestone-audit-metadata-reconciliation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-29
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for metadata-only reconciliation.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Metadata/file checks with `grep`, `node`, and existing markdown artefacts |
| **Config file** | `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, phase SUMMARY/VALIDATION files |
| **Quick run command** | `git diff -- .planning/REQUIREMENTS.md .planning/ROADMAP.md .planning/STATE.md .planning/phases/02-packet-schema-state-contracts/02-VALIDATION.md .planning/phases/05-extension-api-migration-hardening/05-VALIDATION.md .planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/06-VALIDATION.md .planning/phases/07-extension-runtime-slot-wiring/07-VALIDATION.md .planning/phases/08-fsm-migration-control-event-read-path/08-VALIDATION.md` |
| **Full suite command** | `node -e "const fs=require('fs'); const files=['.planning/REQUIREMENTS.md','.planning/ROADMAP.md','.planning/STATE.md']; for (const f of files) { if (!fs.existsSync(f)) throw new Error(f+' missing'); }"` plus plan-specific grep checks |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's grep/file-existence assertions.
- **After every plan wave:** Run all plan-specific metadata assertions plus `git diff --check` on touched planning artefacts.
- **Before `/gsd-verify-work`:** All metadata assertions must pass and no runtime/source code files should be modified by Phase 9.
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | EXT/MIGR/SLIM/OUTL traceability | — | No runtime source changes; no secret exposure | metadata | `grep -n "EXT-01" .planning/REQUIREMENTS.md && grep -n "MIGR-01" .planning/REQUIREMENTS.md && grep -n "SLIM-02" .planning/REQUIREMENTS.md` | ✅ W0 | ✅ green |
| 09-01-02 | 01 | 1 | Phase roadmap status | — | Roadmap status matches verified phases | metadata | `grep -n "Phase 7: Extension Runtime Slot Wiring" .planning/ROADMAP.md && grep -n "7. Extension Runtime Slot Wiring" .planning/ROADMAP.md` | ✅ W0 | ✅ green |
| 09-01-03 | 01 | 1 | SUMMARY frontmatter | — | Historical prose is not rewritten silently | metadata | `grep -n "requirements-completed" .planning/phases/05-extension-api-migration-hardening/05-05-SUMMARY.md .planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/06-01-SUMMARY.md .planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/06-05-SUMMARY.md` | ✅ W0 | ✅ green |
| 09-01-04 | 01 | 1 | Validation metadata | — | Retroactive corrections cite evidence | metadata | `grep -n "wave_0_complete: true" .planning/phases/02-packet-schema-state-contracts/02-VALIDATION.md .planning/phases/05-extension-api-migration-hardening/05-VALIDATION.md .planning/phases/06-compatibility-cleanup-hard-outlier-posturing-v2/06-VALIDATION.md .planning/phases/07-extension-runtime-slot-wiring/07-VALIDATION.md .planning/phases/08-fsm-migration-control-event-read-path/08-VALIDATION.md` | ✅ W0 | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing metadata artefacts cover all phase requirements. No new tests or framework setup are required because Phase 9 changes planning metadata only.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Historical prose preservation | Phase 9 metadata reconciliation | Requires reviewing diffs for narrative rewrites vs frontmatter additions | Inspect `git diff -- .planning/phases/*/*SUMMARY.md` and confirm any narrative changes are appended under `## Phase 9 Amendments` |

---

## Validation Sign-Off

- [x] All tasks have automated grep/file checks or Wave 0 metadata dependencies
- [x] Sampling continuity: every metadata task has direct assertions
- [x] Wave 0 covers all referenced planning artefacts
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-29
