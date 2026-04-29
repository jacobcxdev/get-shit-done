Here is the cross-review and synthesis of the first-pass positions for Phase 6.

### 1. `check-slim-eligibility` and CI Enforcement (SLIM-01, SLIM-03)
- **Positions:** All models agree that a `--check-slim-eligibility <workflow-id>` check is required and should reuse compiler/parity logic rather than reinventing it. All agree that the existing `scripts/phase4-parity.cjs` must act as the CI gate.
- **Resolution:** Extend `phase4-parity.cjs` with a conditional step (e.g., wave-0) that runs `gsd-sdk compile --check-slim-eligibility <workflow-id>` for any workflow currently being slimmed. This prevents premature slimming while keeping a single, hermetic parity gate.
- **Decision:** **[consensus]** Implement `--check-slim-eligibility` as a compiler flag. Extend `phase4-parity.cjs` to enforce this check conditionally when slim artifacts are present.

### 2. Slim Transition Sequencing and Thin Launchers (SLIM-01 vs SLIM-02)
- **Positions:** Gemini proposes an atomic move-and-replace, whereas Claude strongly advocates for a two-commit sequence (Commit 1: reduce to thin launcher; Commit 2: archive original) to allow safer CI validation and Git-based rollback. Codex emphasizes a strict, prose-free template for the retained launcher.
- **Resolution:** A two-commit sequence provides clearer auditability and safer rollback via `gsd-sdk undo`. The retained "thin launcher" must be strictly advisory (no runtime branching or prose) and maintain the original file path to preserve entry points.
- **Decision:** **[majority]** The slim transition must be a strict two-step process in separate commits: Step 1 produces the thin launcher in-place; Step 2 archives the original prose to `docs/archive/`.

### 3. Hard Outlier Posture Storage (OUTL-01/02)
- **Positions:** Claude proposes YAML files in `sdk/src/advisory/outlier-postures/` read dynamically by the compiler. Gemini proposes structured TypeScript data generating a markdown artifact. Codex requires registration in the classification manifest with documented evidence.
- **Resolution:** Claude's YAML approach offers the best balance: it provides human-readable, diffable documents (like Markdown) while still being strongly parsed by the compiler to populate `ClassificationEntry.outlierPosture` and enforce OUTL-02 classification.
- **Decision:** **[majority]** Store hard outlier postures as YAML files under `sdk/src/advisory/outlier-postures/`. The compiler will glob these to validate the seed hard outliers and populate manifest data dynamically.

### 4. Hard Outlier Slimming Eligibility
- **Positions:** Gemini asked if hard outliers will ever be slimmed.
- **Resolution:** By definition, hard outliers (e.g., `/gsd-fast`, `/gsd-graphify`) do not migrate to FSM packets. Therefore, they cannot pass the typed transitions/packet sequencing gates required for slimming.
- **Decision:** **[consensus]** Hard outliers are permanently exempt from slimming and retain their full Markdown prose.

### 🚩 Three-Way Splits Requiring Escalation
**None.** The models are largely aligned on the constraints and diverge only on implementation details (e.g., TS vs YAML storage, 1 vs 2 commits), which have been decisively resolved above. No user escalation is required.
