# Phase 6 Gemini First Pass

## Recommended Gray Areas

### Archiving Strategy vs. Thin Launchers (SLIM-01 vs SLIM-02 Conflict)
- **Decision:** When a workflow is fully superseded, the original rich-prose markdown file is moved to `docs/archive/`, and a new "thin launcher" markdown file with the exact same name is generated in `get-shit-done/workflows/`. This thin launcher contains only the advisory invocation block.
- **Rationale:** This resolves the apparent contradiction between SLIM-01 (moving files to archive) and SLIM-02 (retaining launcher files). It preserves the existing file resolution paths for the CLI while removing the prose from the operational directory.
- **Planning implications:** The `--check-slim-eligibility` command or a companion `--apply-slim` command must handle atomic file I/O to simultaneously move the original to `docs/archive/` and write the thin proxy, requiring care around Git staging and uncommitted changes.

### Storage and Truth Source for Hard Outlier Posture Records (OUTL-01/02)
- **Decision:** Define the posture records (classification, rationale, type) as structured TypeScript data within the SDK (`sdk/src/generated/compile/outliers.ts`) so they are injected directly into the manifest generator. Generate a human-readable `docs/ARCHITECTURE-OUTLIERS.md` file dynamically from this structured data during the build step.
- **Rationale:** OUTL-02 requires the compiler to recognize these as `hard-outlier` to avoid errors. Storing the rationale in code guarantees the compiler has a single source of truth, preventing drift between the manifest data and external markdown documentation.
- **Planning implications:** A new TypeScript interface (`HardOutlierRecord`) is needed in the SDK. The `gsd-sdk compile` process must be updated to export the markdown documentation artifacts alongside the JSON manifests.

### Eligibility Granularity and Parity Validation (SLIM-01)
- **Decision:** Eligibility is strictly binary and delegates entirely to the existing Phase 4 parity gate. `gsd-sdk compile --check-slim-eligibility <workflow-id>` must internally invoke or share the exact same validation logic as `scripts/phase4-parity.cjs`.
- **Rationale:** The prompt states Phase 4 parity gates are "non-negotiable and hermetic." Creating a new, separate set of heuristic checks for "typed transitions" and "packet sequencing" in Phase 6 risks diverging from the established Phase 4 guarantees.
- **Planning implications:** The SDK compiler needs a reliable way to query the Phase 4 parity outcomes, either by executing the CJS script and parsing its output, or by extracting the core validation logic into a shared library.

### CI Enforcement Mechanics (SLIM-03)
- **Decision:** Introduce a `--ci-enforce-slim` flag to the Phase 4 parity script (or a dedicated CI wrapper). This mode will scan `get-shit-done/workflows/` for any files classified as "thin launchers" and assert that their corresponding FSM states pass all parity gates. If a workflow is slimmed but fails parity, the script exits `1`.
- **Rationale:** This creates a strict, deterministic CI gate that fails the build if a developer attempts to prematurely delete workflow prose before the FSM is truly ready, enforcing the requirement locally and remotely.
- **Planning implications:** The `scripts/phase4-parity.cjs` script needs to be updated to detect the difference between a legacy workflow and a thin launcher, and CI workflows must be updated to run this new check.

## Additional Questions
- What is the exact syntax for the "advisory invocation" in the thin launchers? (e.g., Markdown YAML frontmatter, HTML comments, or a specific code block tag like ````gsd-advisory````).
- Will hard outliers ever be slimmed, or do they permanently retain their full Markdown prose since they bypass the standard FSM lifecycle?
- Is there a planned rollback mechanism (e.g., a command to restore the archived prose) if a slimmed FSM workflow fails in production due to an edge case not covered by the Phase 4 parity gate?

## Risks and Assumptions
- **Assumption:** The legacy CJS CLI runtime already knows how to execute a workflow purely from the "advisory invocation" block in a thin launcher, and no longer strictly requires parsing the prose to function.
- **Risk:** Premature slimming. If the Phase 4 parity gates lack coverage for specific edge-case LLM behaviors that were previously guided by the prose, removing the prose will introduce runtime regressions despite passing the CI gate.
- **Risk:** File I/O conflicts. Automated scripts moving files to `docs/archive/` and writing thin launchers might conflict with active developer branches or uncommitted changes if not handled carefully.
