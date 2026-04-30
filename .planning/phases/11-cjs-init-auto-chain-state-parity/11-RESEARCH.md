# Phase 11: CJS Init Auto-Chain State Parity — Research

**Researched:** 2026-04-30
**Domain:** CJS init synchronous path / FSM state-file reading / Node.js test regression
**Confidence:** HIGH — all findings verified from live source code

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**State Source**
- D-01: Preserve the CJS `init plan-phase` output field `auto_chain_active`; downstream workflows still consume that field.
- D-02: Derive CJS `auto_chain_active` only from FSM-scoped `autoMode`, never from `.planning/config.json` `workflow._auto_chain_active` or an equivalent flat config key.
- D-03: `auto_chain_active` mirrors SDK `check.auto-mode`'s `auto_chain_active` field, not the broader `active` field.

**FSM Interpretation**
- D-04: Treat FSM `autoMode` as chain-active only when `autoMode.active === true` and `autoMode.source` is `auto_chain` or `both`.
- D-05: Missing FSM state means `auto_chain_active: false`; stale flat config must not resurrect auto-chain behaviour.
- D-06: Malformed or unreadable FSM state must fail closed; no flat config fallback is permitted.

**Workstream Scoping**
- D-07: CJS init must respect the same state-path convention as the SDK: flat mode reads `.planning/fsm-state.json`; workstream mode reads `.planning/workstreams/<workstream>/fsm-state.json`.
- D-08: Workstream auto-chain state is isolated. Do not fall back from a missing/false workstream FSM state to root `.planning/fsm-state.json`.

**Regression Proof**
- D-09: Replace the legacy-positive CJS test that expects config-derived `_auto_chain_active` with negative stale-config tests and positive FSM-state tests.
- D-10: Required regression cases: stale `workflow._auto_chain_active: true` with no FSM state returns false; stale key with FSM `active:false/source:none` returns false; FSM `active:true/source:auto_chain` returns true; FSM `active:true/source:both` returns true; workstream FSM state affects only that workstream.
- D-11: Add a guard that prevents reintroducing the computed legacy key pattern, including constructions such as `['_auto', 'chain', 'active'].join('_')`.

### Claude's Discretion

- Implementation can use a small synchronous CJS helper rather than shelling out to `gsd-sdk query check.auto-mode`, because `init.cjs` is currently synchronous and should avoid subprocess coupling in the init path. The helper must stay narrowly aligned with the SDK predicate and be covered by tests.

### Deferred Ideas (OUT OF SCOPE)

- Phase 10 metadata/audit tech debt.
- Broader CJS retirement or full SDK-only init migration.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STAT-04 | `workflow._auto_chain_active` no longer exists as a flat shared key; its semantics are captured per-workstream inside FSM run-state | Gap confirmed at `init.cjs:211` and `init.cjs:267`; fix requires reading `fsm-state.json` synchronously instead |
| STAT-03 | `gsd-sdk query check.auto-mode <workstream>` returns the auto-mode flag scoped to the specified workstream | Already satisfied by SDK; CJS parity for flat mode is what Phase 11 must close |
| RNNR-02 | The existing PhaseRunner canonical phase chain is preserved with identical transitions, locking behaviour, and emitted packet sequence | `auto_chain_active` output field must be preserved; only the derivation source changes |
</phase_requirements>

---

## Summary

Phase 11 closes the last open v1.0 requirement. The gap is a split-brain in auto-chain state derivation: the SDK query path (`check.auto-mode`) reads FSM-scoped `autoMode` from `.planning/fsm-state.json`, but the CJS `init plan-phase` command still reads the legacy flat config key `workflow._auto_chain_active` from `.planning/config.json`. Both paths emit the same output field `auto_chain_active`, but they disagree on its value when FSM state is absent or diverges from stale config.

The live project demonstrates the bug: `.planning/config.json` contains `workflow._auto_chain_active: true` (written by an old workflow), while `.planning/fsm-state.json` contains `autoMode: { active: true, source: "auto_chain" }`. Both happen to agree today, but any session that clears the FSM state or starts a fresh workstream would see `auto_chain_active: true` from CJS init despite FSM state returning `false`, enabling unintended auto-advance.

The fix is a narrow synchronous helper function inside `init.cjs` that reads `fsm-state.json` directly using `fs.readFileSync`, applies the same predicate as the SDK (`active === true && (source === 'auto_chain' || source === 'both')`), and falls closed on missing or malformed files. No subprocess coupling, no changes to the SDK, no changes to downstream workflows.

**Primary recommendation:** Add `readFsmAutoChainActiveSync(cwd, workstream)` to `init.cjs`, call it in `cmdInitPlanPhase()` in place of the `legacyAutoChainKey` read, and replace the one legacy-positive CJS test with the five regression cases specified in D-10.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `auto_chain_active` derivation | CJS init (synchronous runtime) | SDK advisory (`check.auto-mode`) for async paths | CJS init is synchronous and must not shell out; SDK path already correct and is the parity reference |
| FSM state file reading | Filesystem (`fsm-state.json`) | — | State is per-workstream JSON on disk; no service boundary |
| `auto_chain_active` output field | CJS `init plan-phase` output contract | SDK `init.ts` `initPlanPhase` (already migrated) | Both must emit identical field; only CJS source derivation is broken |
| Legacy key guard (D-11) | CJS regression test + SDK scan test | — | `check-auto-mode.test.ts` already has a file-scan guard; CJS needs parallel coverage |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs` (sync) | built-in | Read `fsm-state.json` synchronously | `init.cjs` is synchronous throughout; `fs.readFileSync` is the only zero-dependency option |
| `node:path` | built-in | Compute FSM state file path | Already used pervasively in `init.cjs` |
| `node:test` | built-in | CJS regression tests | Established test runner for all `tests/*.test.cjs`; no additional dependency |
| `node:assert/strict` | built-in | CJS test assertions | Standard in all existing CJS tests |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | ^3.1.1 | SDK TypeScript tests | Only if a TypeScript-layer regression test is added; not needed for Phase 11's CJS scope |

**Installation:** No new packages required. All dependencies are Node.js built-ins or already installed.

---

## Architecture Patterns

### System Architecture Diagram

```
CJS gsd-tools.cjs  →  init plan-phase command
         |
         ↓
  cmdInitPlanPhase()  [init.cjs:200]
         |
         ├── loadConfig()               -- reads config.json (for auto_advance, mode, etc.)
         |
         ├── [BEFORE FIX]
         |   legacyAutoChainKey = ['_auto','chain','active'].join('_')
         |   auto_chain_active = rawConfig.workflow?.[legacyAutoChainKey]  ← WRONG SOURCE
         |
         └── [AFTER FIX]
             readFsmAutoChainActiveSync(cwd, workstream?)
                      |
                      ↓
             fsm-state path: .planning/fsm-state.json
                         or: .planning/workstreams/<ws>/fsm-state.json
                      |
                      ├── file missing  → return false  (D-05)
                      ├── JSON invalid  → return false + warn  (D-06 fail-closed)
                      └── parsed ok     → autoMode.active && source ∈ {auto_chain, both}
```

### Recommended Project Structure

No new directories. The helper lives inside `get-shit-done/bin/lib/init.cjs` (the only file being modified).

### Pattern 1: Synchronous FSM Auto-Chain Read (CJS helper)

**What:** Small synchronous function that reads `fsm-state.json`, applies the SDK predicate, and fails closed.
**When to use:** Called exclusively from `cmdInitPlanPhase()` during CJS init.

```javascript
// Source: verified from sdk/src/query/check-auto-mode.ts (async reference)
// CJS synchronous equivalent — no external dependencies
function readFsmAutoChainActiveSync(cwd, workstream) {
  // Workstream path mirrors sdk/src/workstream-utils.ts relPlanningPath()
  const planningBase = workstream
    ? path.join(cwd, '.planning', 'workstreams', workstream)
    : path.join(cwd, '.planning');
  const fsmPath = path.join(planningBase, 'fsm-state.json');

  let raw;
  try {
    raw = fs.readFileSync(fsmPath, 'utf-8');
  } catch (err) {
    // ENOENT: no FSM state → false (D-05)
    // Other read errors: fail closed (D-06)
    return false;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON → fail closed (D-06)
    process.stderr.write(
      `gsd-tools: warning: failed to parse ${fsmPath}: malformed JSON\n`
    );
    return false;
  }

  const source = parsed.autoMode?.source;
  return Boolean(
    parsed.autoMode?.active &&
    (source === 'auto_chain' || source === 'both')
  );
}
```

**Reference predicate in SDK (verified):**
```typescript
// Source: sdk/src/query/check-auto-mode.ts:58-59
const source = parsed.autoMode?.source;
return Boolean(parsed.autoMode?.active && (source === 'auto_chain' || source === 'both'));
```

### Pattern 2: Workstream Path Convention

The workstream-scoped FSM state path must match `fsmStatePath()` from the SDK exactly:

```javascript
// SDK reference (sdk/src/advisory/fsm-state.ts:180-185):
// fsmStatePath(projectDir, workstream) =>
//   join(projectDir, relPlanningPath(workstream), 'fsm-state.json')
//
// relPlanningPath (sdk/src/workstream-utils.ts:29-32):
//   if (!workstream) return '.planning';
//   return posix.join('.planning', 'workstreams', workstream);

// CJS equivalent:
const planningBase = workstream
  ? path.join(cwd, '.planning', 'workstreams', workstream)
  : path.join(cwd, '.planning');
const fsmPath = path.join(planningBase, 'fsm-state.json');
```

### Pattern 3: Replacing the Legacy Read in `cmdInitPlanPhase`

**Exact lines to change in `init.cjs`:**

```javascript
// Lines 206-211 BEFORE (remove):
const rawConfigPath = path.join(planningDir(cwd), 'config.json');
let rawConfig = {};
try {
  rawConfig = JSON.parse(fs.readFileSync(rawConfigPath, 'utf-8'));
} catch { /* intentionally empty */ }
const legacyAutoChainKey = ['_auto', 'chain', 'active'].join('_');

// Line 267 BEFORE (remove):
auto_chain_active: !!(rawConfig.workflow?.[legacyAutoChainKey]),

// AFTER — the rawConfig block may be removed entirely if no other code in
// cmdInitPlanPhase uses rawConfig (confirmed: it is only used for legacyAutoChainKey):
auto_chain_active: readFsmAutoChainActiveSync(cwd),
```

Note: `loadConfig()` is already called at line 205 and provides all other config values. The `rawConfig` block exists solely to read the legacy key. Once removed, no raw config read is needed in this function.

### Pattern 4: Workstream Argument Threading

`cmdInitPlanPhase` currently has no `workstream` argument. The function signature and internal callers must be checked to see if workstream-scoped init is already supported:

```javascript
// Current signature (init.cjs:200):
function cmdInitPlanPhase(cwd, phase, raw, options = {}) { ... }
```

The `options` object may carry a workstream value; check the CLI dispatch in `gsd-tools.cjs` to confirm. If workstream is never passed to `cmdInitPlanPhase` today (only flat mode), Phase 11 can safely call `readFsmAutoChainActiveSync(cwd)` without a workstream argument, matching the current CJS behaviour. D-07 and D-08 must still be implemented in the helper for correctness when workstream support arrives.

### Anti-Patterns to Avoid

- **Shelling out to `gsd-sdk query check.auto-mode`:** `init.cjs` is synchronous; subprocess coupling in the init path adds latency, complicates error handling, and violates the billing-boundary design principle (BILL-01/03).
- **Importing SDK TypeScript from CJS:** The SDK is ES module / TypeScript; CJS cannot `require()` it directly without a build step.
- **Falling back to flat config on FSM read failure:** Violates D-06. Any fallback that consults `workflow._auto_chain_active` re-introduces the STAT-04 bug.
- **Using `rawConfig` for any other purpose in `cmdInitPlanPhase`:** The entire `rawConfig` block can be deleted; it exists only for the legacy key.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FSM path computation | Custom path-joining logic | Exact same formula as `fsmStatePath()` from SDK advisory | Must stay byte-identical to avoid divergence |
| JSON parse with schema validation | Custom validator | Simple optional-chaining read of `autoMode.active` / `autoMode.source` | Schema validation belongs in `parseFsmRunState`; CJS helper only needs the two fields |
| Workstream name validation | Custom regex | Mirror SDK's `validateWorkstreamName` pattern (`/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`) if validation is needed | Consistent rejection semantics across CJS and SDK |

**Key insight:** The helper must stay narrowly aligned with the SDK predicate. Any logic beyond `active && source ∈ {auto_chain, both}` would drift from the reference and require independent maintenance.

---

## Runtime State Inventory

Phase 11 is not a rename or migration phase. However, the live project has a stale flat config key that serves as the regression fixture:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `.planning/config.json` contains `workflow._auto_chain_active: true` | No data migration — the key remains as a stale regression fixture; code must ignore it |
| Live service config | `.planning/fsm-state.json` exists with `autoMode: { active: true, source: "auto_chain" }` | No action — FSM state is the new source of truth; helper reads it correctly |
| OS-registered state | None | None — verified |
| Secrets/env vars | None | None — verified |
| Build artifacts | None relevant to this phase | None |

**Live state confirmation:**
- `.planning/config.json` line 34: `"_auto_chain_active": true` — stale key that the fix removes reliance on
- `.planning/fsm-state.json`: `autoMode.active = true`, `autoMode.source = "auto_chain"` — FSM state the helper will now read

After the fix, both the stale config key and the FSM state exist simultaneously. The test suite validates that only the FSM state drives the output.

---

## Common Pitfalls

### Pitfall 1: Removing `rawConfig` But Missing Other Consumers

**What goes wrong:** The `rawConfig` block (lines 206-211 of `init.cjs`) is removed, but another caller in `cmdInitPlanPhase` still references `rawConfig`, causing a `ReferenceError` at runtime.

**Why it happens:** `rawConfig` was introduced specifically for the legacy key (see comment at line 265 of `init.cjs`). It is not used elsewhere in `cmdInitPlanPhase`, but a developer refactoring the function might miss this.

**How to avoid:** Confirm by inspection that `rawConfig` is referenced only at line 267 before removing the block. The existing tests in `init.test.cjs` will catch any regression if other fields disappear.

**Warning signs:** `ReferenceError: rawConfig is not defined` in test output.

### Pitfall 2: Legacy Test Creates False Confidence

**What goes wrong:** The existing test at `init.test.cjs:1477` (`'init plan-phase reflects auto_chain_active true when set in config'`) passes even after the fix — because the test writes `{ workflow: { _auto_chain_active: true } }` to config but the live project's `fsm-state.json` also has `active: true`. The test passes for the wrong reason.

**Why it happens:** The test tmpDir has no `fsm-state.json`, so after the fix the helper returns `false`, and the test would correctly fail. But if the tester runs the test in the live project root instead of a temp dir, FSM state would be found.

**How to avoid:** The `createTempProject()` helper creates an isolated tmpDir with no FSM state. As long as tests run via `runGsdTools` in the tmpDir, FSM state from the live project cannot contaminate results. Confirm `createTempProject()` does not copy `.planning/fsm-state.json` (it does not — it only creates `.planning/phases/`).

**Warning signs:** The legacy-positive test passes without writing FSM state to the tmpDir after the fix.

### Pitfall 3: The D-11 Guard Test Must Scan `init.cjs`

**What goes wrong:** The existing guard test in `sdk/src/query/check-auto-mode.test.ts` at line 92-113 scans `get-shit-done/bin/lib` and other paths for the needle string. After the fix removes the computed key from `init.cjs`, the scan passes. But D-11 requires a guard that prevents *reintroduction*, not just current absence.

**Why it happens:** The existing scan test already covers `get-shit-done/bin/lib`. Phase 11 does not need to add a new scan target — but must confirm the scan covers `init.cjs` after the fix (it does, since the scan covers the entire `lib/` directory).

**How to avoid:** Verify the scan in `check-auto-mode.test.ts` includes `get-shit-done/bin/lib` as a target (confirmed at line 97). No additional guard test is needed at the SDK level. The CJS regression tests cover the behaviour side.

**Warning signs:** The guard test uses a path that excludes `init.cjs` (it does not — `lib/` is the full directory).

### Pitfall 4: Workstream Path Separator on Windows

**What goes wrong:** On Windows, `path.join` uses backslashes, producing `.planning\workstreams\<ws>\fsm-state.json`. `fs.readFileSync` accepts this path on Windows, but POSIX-dependent code that parses the string would break.

**Why it happens:** `init.cjs` runs on all platforms. The SDK uses `toPosixPath(join(...))` internally.

**How to avoid:** Use `path.join` for actual filesystem operations (reading the file). Do not expose the path in output; only use it for `fs.readFileSync`. Alternatively, use `path.join` and rely on Node.js's path normalisation for file I/O.

---

## Code Examples

### Example 1: Minimal helper that mirrors the SDK predicate

```javascript
// Source: derived from sdk/src/query/check-auto-mode.ts:39-59 (async original)
// Synchronous CJS equivalent for init.cjs

/**
 * Read auto-chain state from FSM state file.
 * Returns true only when autoMode.active is true and source is 'auto_chain' or 'both'.
 * Falls closed (false) when file is missing or JSON is malformed.
 *
 * Mirrors readFsmAutoChainActive() in sdk/src/query/check-auto-mode.ts.
 *
 * @param {string} cwd - Project root.
 * @param {string|undefined} [workstream] - Optional workstream name.
 * @returns {boolean}
 */
function readFsmAutoChainActiveSync(cwd, workstream) {
  const planningBase = workstream
    ? path.join(cwd, '.planning', 'workstreams', workstream)
    : path.join(cwd, '.planning');
  const fsmPath = path.join(planningBase, 'fsm-state.json');

  let raw;
  try {
    raw = fs.readFileSync(fsmPath, 'utf-8');
  } catch {
    return false;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stderr.write(`gsd-tools: warning: cannot parse ${fsmPath}\n`);
    return false;
  }

  const source = parsed.autoMode?.source;
  return Boolean(parsed.autoMode?.active && (source === 'auto_chain' || source === 'both'));
}
```

### Example 2: Updated call site in `cmdInitPlanPhase`

```javascript
// Replaces lines 206-211 and line 267 in init.cjs

// REMOVE: rawConfig block (lines 206-211)
// const rawConfigPath = path.join(planningDir(cwd), 'config.json');
// let rawConfig = {};
// try {
//   rawConfig = JSON.parse(fs.readFileSync(rawConfigPath, 'utf-8'));
// } catch { /* intentionally empty */ }
// const legacyAutoChainKey = ['_auto', 'chain', 'active'].join('_');

// CHANGE line 267:
// BEFORE: auto_chain_active: !!(rawConfig.workflow?.[legacyAutoChainKey]),
// AFTER:
auto_chain_active: readFsmAutoChainActiveSync(cwd),
```

### Example 3: CJS regression tests for D-10 cases

```javascript
// In tests/init.test.cjs (node:test, node:assert/strict pattern)
// Replaces the single legacy-positive test at line 1477.

describe('#STAT-04 gap closure: auto_chain_active derives from FSM state, not config', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '01-auth'), { recursive: true });
  });

  afterEach(() => { cleanup(tmpDir); });

  // D-10 case 1: stale config key, no FSM state → false
  test('stale _auto_chain_active in config without FSM state returns false', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ workflow: { _auto_chain_active: true } })
    );
    // No fsm-state.json written
    const result = runGsdTools('init plan-phase 1', tmpDir);
    assert.ok(result.success);
    assert.strictEqual(JSON.parse(result.output).auto_chain_active, false);
  });

  // D-10 case 2: stale config key, FSM active=false/source=none → false
  test('stale _auto_chain_active in config with FSM active=false returns false', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ workflow: { _auto_chain_active: true } })
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'fsm-state.json'),
      JSON.stringify({ autoMode: { active: false, source: 'none' }, stateSchemaVersion: 1 })
    );
    const result = runGsdTools('init plan-phase 1', tmpDir);
    assert.ok(result.success);
    assert.strictEqual(JSON.parse(result.output).auto_chain_active, false);
  });

  // D-10 case 3: FSM active=true/source=auto_chain → true
  test('FSM autoMode active=true source=auto_chain returns true', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'fsm-state.json'),
      JSON.stringify({ autoMode: { active: true, source: 'auto_chain' }, stateSchemaVersion: 1 })
    );
    const result = runGsdTools('init plan-phase 1', tmpDir);
    assert.ok(result.success);
    assert.strictEqual(JSON.parse(result.output).auto_chain_active, true);
  });

  // D-10 case 4: FSM active=true/source=both → true
  test('FSM autoMode active=true source=both returns true', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'fsm-state.json'),
      JSON.stringify({ autoMode: { active: true, source: 'both' }, stateSchemaVersion: 1 })
    );
    const result = runGsdTools('init plan-phase 1', tmpDir);
    assert.ok(result.success);
    assert.strictEqual(JSON.parse(result.output).auto_chain_active, true);
  });

  // D-10 case 5: workstream FSM state affects only that workstream
  // (workstream path not yet wired into cmdInitPlanPhase CLI; add as
  // a unit-level test for readFsmAutoChainActiveSync if workstream arg exists,
  // or skip CLI-level test until workstream wiring lands)
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `workflow._auto_chain_active` in config.json | `autoMode` in `fsm-state.json` | Phase 2 (SDK), Phase 11 (CJS) | Config key becomes inert; FSM state is authoritative |
| Global flat auto-chain flag | Per-workstream auto-chain via `autoMode.source` | Phase 2 | Workstream isolation prevents cross-workstream activation |
| CJS reads config directly | CJS reads `fsm-state.json` directly (synchronous) | Phase 11 | Eliminates split-brain between CJS and SDK paths |

**Deprecated/outdated:**
- `workflow._auto_chain_active`: The key remains physically in `.planning/config.json` of the live project as a regression fixture, but after Phase 11 no code reads or writes it. It is an inert artifact.

---

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cmdInitPlanPhase` does not currently receive a `workstream` argument from the CLI dispatch in `gsd-tools.cjs` (only flat mode is wired) | Architecture Patterns / Anti-Patterns | If workstream IS wired, the helper call site must pass the workstream argument; the helper itself handles both cases correctly regardless |

The claim above is assessed LOW risk: even if workstream is wired, the helper signature accepts `undefined` and defaults to flat mode, which is the correct behaviour.

**If this table is empty of high-risk items:** All other claims in this research were verified directly from live source code.

---

## Open Questions (RESOLVED)

1. **Is `workstream` ever passed to `cmdInitPlanPhase` today?**
   - What we know: The function signature at line 200 accepts `options = {}` but no workstream param; the SDK `initPlanPhase` in `init.ts` does thread workstream correctly via `checkAutoMode([], projectDir, workstream)`.
   - What's unclear: Whether the CJS CLI dispatch passes a workstream value through options.
   - Recommendation: Inspect `gsd-tools.cjs` CLI dispatch for `init plan-phase`. If workstream is not wired, call `readFsmAutoChainActiveSync(cwd)` (no second arg). Document that workstream support is deferred to a follow-on change. Either way, the helper itself is correct.

2. **Should the stale `_auto_chain_active: true` in `.planning/config.json` be removed?**
   - What we know: D-02 says never read it; CONTEXT.md scope says out of scope to clean config artifacts.
   - What's unclear: Whether leaving it causes confusion for future maintainers.
   - Recommendation: Leave it as-is. The fix proves the key is inert. Removing it is a separate cleanup outside Phase 11 scope.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 11 is a code/config-only change. No external tools, services, runtimes, databases, or CLIs beyond `node` (already installed) are required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (CJS layer) | Node.js built-in `node:test` |
| Config file | `scripts/run-tests.cjs` (custom runner) |
| Quick run command | `node --test tests/init.test.cjs` |
| Full suite command | `npm test` (all `.test.cjs` files, concurrency 4) |
| SDK layer | Vitest `cd sdk && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STAT-04 | stale `_auto_chain_active: true` config + no FSM → `auto_chain_active: false` | unit (CJS) | `node --test tests/init.test.cjs` | Needs replacement of line 1477 test |
| STAT-04 | FSM `active:true/source:auto_chain` → `auto_chain_active: true` | unit (CJS) | `node --test tests/init.test.cjs` | New test — Wave 0 gap |
| STAT-04 | FSM `active:true/source:both` → `auto_chain_active: true` | unit (CJS) | `node --test tests/init.test.cjs` | New test — Wave 0 gap |
| STAT-04 | FSM `active:false/source:none` + stale config → `false` | unit (CJS) | `node --test tests/init.test.cjs` | New test — Wave 0 gap |
| STAT-03 | `auto_chain_active` field present and defaults false | unit (CJS) | `node --test tests/init.test.cjs` | Exists (line 1450) — passes through |
| D-11 | Legacy computed key absent from `get-shit-done/bin/lib` | scan (TS) | `cd sdk && npm run test:unit` | Exists (`check-auto-mode.test.ts:92`) |
| RNNR-02 | Output field `auto_chain_active` still present in init plan-phase | unit (CJS) | `node --test tests/init.test.cjs` | Exists (line 1454) |

### Sampling Rate

- **Per task commit:** `node --test tests/init.test.cjs`
- **Per wave merge:** `npm test && cd sdk && npm run test:unit`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/init.test.cjs` — Replace legacy-positive test at line 1477 with D-10 regression cases (5 new tests, 1 removed)
- [ ] `get-shit-done/bin/lib/init.cjs` — Add `readFsmAutoChainActiveSync()` helper and update `cmdInitPlanPhase()` call site

*(No new test files needed — changes are within existing files)*

---

## Security Domain

The phase changes only synchronous local file I/O within `.planning/`. No authentication, cryptography, network access, user input, or session management is involved. ASVS categories V2, V3, V4, V5, V6 do not apply.

The one relevant security property is fail-closed behaviour: D-06 requires that malformed FSM JSON does not fall back to a less-restricted state. The helper satisfies this by returning `false` on parse failure.

---

## Sources

### Primary (HIGH confidence)

- `get-shit-done/bin/lib/init.cjs` lines 200-351 — live CJS `cmdInitPlanPhase` function; gap confirmed at lines 206-211 and 267
- `sdk/src/query/check-auto-mode.ts` — SDK reference implementation; predicate verified at lines 39-59
- `sdk/src/advisory/fsm-state.ts` lines 57-71, 180-185 — `FsmRunState` type and `fsmStatePath()` function; state-path convention verified
- `sdk/src/workstream-utils.ts` lines 29-32 — `relPlanningPath()` definition; path formula verified
- `tests/init.test.cjs` lines 1420-1487 — existing CJS auto-chain test block; legacy-positive test identified at line 1477
- `sdk/src/query/check-auto-mode.test.ts` lines 92-113 — D-11 scan guard; confirmed it covers `get-shit-done/bin/lib`
- `.planning/config.json` line 34 — live stale config key confirmed (`_auto_chain_active: true`)
- `.planning/fsm-state.json` — live FSM state confirmed (`autoMode.active: true, source: "auto_chain"`)
- `.planning/codebase/TESTING.md` — test framework conventions verified
- `tests/helpers.cjs` lines 79-83 — `createTempProject()` does not copy FSM state; regression isolation confirmed

### Secondary (MEDIUM confidence)

- `.planning/v1.0-MILESTONE-AUDIT.md` — audit evidence for gap location; cross-referenced against live source
- `.planning/phases/11-cjs-init-auto-chain-state-parity/11-CONTEXT.md` — locked decisions from discuss-phase

### Tertiary (LOW confidence)

None. All claims in this research were verified from live source files.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Node.js built-ins only; no new packages
- Architecture: HIGH — verified from live source; SDK reference predicate confirmed
- Pitfalls: HIGH — derived from direct code inspection and existing test patterns
- Test gaps: HIGH — exact line numbers identified in live test file

**Research date:** 2026-04-30
**Valid until:** Stable — CJS init and SDK check-auto-mode are not fast-moving; 90 days
